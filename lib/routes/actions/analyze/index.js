/**
 * Actions Analyze
 * - Determine components of a Dockerfile
 *   for a repository/project by analyzing
 *   the file contents of the repository/project.
 * @module lib/routes/actions/analyze/index
 */
'use strict'
var find = require('101/find')
var flow = require('middleware-flow')
var hasKeypaths = require('101/has-keypaths')
var isObject = require('101/is-object')
var keypath = require('keypather')()
var mw = require('dat-middleware')

var monitorDog = require('monitor-dog')
var GitHub = require('models/apis/github')
var logger = require('logger')
var stacks = require('routes/actions/analyze/data/stacks')
var suggestableServicesNode = require('routes/actions/analyze/data/suggestable-services-nodejs')
var suggestableServicesPHP = require('routes/actions/analyze/data/suggestable-services-php')
var suggestableServicesPython = require('routes/actions/analyze/data/suggestable-services-python')
var suggestableServicesRuby = require('routes/actions/analyze/data/suggestable-services-ruby')
var validations = require('middlewares/validations')

var app = module.exports = require('express')()

/**
 * Attempting to globally define exact representation
 * of each language/framework for response formatting
 * in order to match frontend expectations.
 */
var javascriptNodeJS = 'nodejs'
var php = 'php'
var python = 'python'
var rubyRor = 'ruby_ror'

/**
 * Convert base64 encoded string to utf8
 * @param {String} val
 * @return {String}
 */
function base64ToUTF8 (val) {
  return new Buffer(val, 'base64').toString('utf8')
}

function addDependencyFile (filename) {
  return function (req, res, next) {
    var github = new GitHub({
      token: keypath.get(req, 'sessionUser.accounts.github.accessToken')
    })
    github.getRepoContent(req.query.repo, filename)
      .tap(function (result) {
        req.dependencyFile = result
      })
      .asCallback(next)
  }
}

/**
 * fetch dependency file from github for different project types
 * respond w/ error if none found
 * NOTE: flow.or will respond w/ first error it encounters
 * if no conditions are truthy - "unknown language/frame..."
 */
var checkForDependencyFiles = flow.or(
  mw.next(mw.Boom.badRequest('unknown language/framework type', {report: false})),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'Gemfile'})))
    .then(mw.req().set('languageFramework', rubyRor),
      mw.req().set('supportedLanguageVersions', stacks.ruby),
      addDependencyFile('/Gemfile'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'requirements.txt'})))
    .then(mw.req().set('languageFramework', python),
      mw.req().set('supportedLanguageVersions', stacks.python),
      addDependencyFile('/requirements.txt'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'setup.py'})))
    .then(mw.req().set('languageFramework', python),
      mw.req().set('supportedLanguageVersions', stacks.python),
      addDependencyFile('/setup.py'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'composer.json'})))
    .then(mw.req().set('languageFramework', php),
      mw.req().set('supportedLanguageVersions', stacks[php]),
      addDependencyFile('/composer.json'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'package.json'})))
    .then(mw.req().set('languageFramework', javascriptNodeJS),
      mw.req().set('supportedLanguageVersions', stacks[javascriptNodeJS]),
      addDependencyFile('/package.json'))
    .else(mw.Boom.badRequest()),
  // backup language detection method, ask GitHub
  flow.series(
    function (req, res, next) {
      var github = new GitHub({
        token: keypath.get(req, 'sessionUser.accounts.github.accessToken')
      })
      github.getRepoAsync(req.query.repo)
      .tap(function (result) {
        req.githubRepo = result
      })
      .asCallback(next)
    },
    mw.req('githubRepo.language')
      .string()
      .else(mw.Boom.badRequest())
      .then(
        // mocking dependency file because it does not
        // exist and remaining route logic expects it
        mw.req().set('dependencyFile', {content: ''}),
        flow.or(
          mw.req('githubRepo.language').validate(validations.equals('JavaScript'))
            .else(mw.Boom.badRequest())
            .then(mw.req().set('languageFramework', javascriptNodeJS),
              mw.req().set('supportedLanguageVersions', stacks[javascriptNodeJS])),
          mw.req('githubRepo.language').validate(validations.equals('Ruby'))
            .else(mw.Boom.badRequest())
            .then(mw.req().set('languageFramework', rubyRor),
              mw.req().set('supportedLanguageVersions', stacks.ruby)),
          mw.req('githubRepo.language').validate(validations.equals('Python'))
            .else(mw.Boom.badRequest())
            .then(mw.req().set('languageFramework', python),
              mw.req().set('supportedLanguageVersions', stacks.python)),
          mw.req('githubRepo.language').validate(validations.equals('PHP'))
            .else(mw.Boom.badRequest())
            .then(mw.req().set('languageFramework', php),
              mw.req().set('supportedLanguageVersions', stacks.php)))))
)

var extractProjectDependencyList = flow.series(
  mw.req('languageFramework')
    .validate(validations.equals(javascriptNodeJS))
    .then(extractJS),
  mw.req('languageFramework')
    .validate(validations.equals(rubyRor))
    .then(extractRuby),
  mw.req('languageFramework')
    .validate(validations.equals(python))
    .then(extractPython),
  mw.req('languageFramework')
    .validate(validations.equals(php))
    .then(extractPHP)
)

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractJS (req, res, next) {
  var log = logger.child({
    method: 'extractJS',
    languageFramework: req.languageFramework
  })
  log.info('extractJS called')
  const timer = monitorDog.timer('actions-analyze-index.extractJS', true, [
    'dependencyFile:' + req.dependencyFile.name,
    'languageFramework:' + req.languageFramework
  ])
  var depFile
  try {
    depFile = JSON.parse(req.dependencyFileContent)
  } catch (e) {
    log.trace({ query: req.query }, 'invalid package.json')
  }
  // some package.json files may not have dependencies key
  req.dependencyList = !isObject(keypath.get(depFile, 'dependencies'))
    ? []
    : Object.keys(depFile.dependencies)
  var nodev = (keypath.get(depFile, 'engine.node') ||
    req.supportedLanguageVersions.defaultVersion)
  var npmv = (keypath.get(depFile, 'engine.npm') ||
    req.supportedLanguageVersions.defaultNpmVersion)
  req.inferredLanguageVersion = {
    nodejs: nodev,
    npm: npmv
  }
  timer.stop()
  next()
}

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractRuby (req, res, next) {
  logger.trace({
    languageFramework: req.languageFramework
  }, 'extractRuby')
  const timer = monitorDog.timer('actions-analyze-index.extractRuby', true, [
    'dependencyFile:' + req.dependencyFile.name,
    'languageFramework:' + req.languageFramework
  ])
  var dependencies = []
  var gemfileDependenciesRegexPattern = /^(\s+)?gem\s+['"](\S+)['"]/gm
  var execResult = gemfileDependenciesRegexPattern.exec(req.dependencyFileContent)
  while (execResult) {
    dependencies.push(execResult[2])
    execResult = gemfileDependenciesRegexPattern.exec(req.dependencyFileContent)
  }
  req.dependencyList = dependencies
  req.inferredLanguageVersion = {
    ruby: req.supportedLanguageVersions.defaultVersion,
    rails: stacks.rails.defaultVersion
  }
  timer.stop()
  next()
}

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractPython (req, res, next) {
  logger.trace({
    languageFramework: req.languageFramework
  }, 'extractPython')
  const timer = monitorDog.timer('actions-analyze-index.extractPython', true, [
    'dependencyFile:' + req.dependencyFile.name,
    'languageFramework:' + req.languageFramework
  ])
  var dependencies = []
  var pythonDependenciesRegexPattern
  var execResult
  if (req.dependencyFile.name === 'requirements.txt') {
    pythonDependenciesRegexPattern = /^([A-z0-9-_]+)/gm
    execResult = pythonDependenciesRegexPattern.exec(req.dependencyFileContent)
    while (execResult) {
      dependencies.push(execResult[1])
      execResult = pythonDependenciesRegexPattern.exec(req.dependencyFileContent)
    }
  } else if (req.dependencyFile.name === 'setup.py') {
    // currently scanning all words in file for dependency matches
    dependencies = req.dependencyFileContent
      .split(' ')
      .map(function (dep) {
        return dep.replace(/[^A-z0-9_-]/g, '')
      })
      .filter(function (dep) {
        return dep.length
      })
  }
  req.dependencyList = dependencies
  req.inferredLanguageVersion = {
    python: req.supportedLanguageVersions.defaultVersion
  }
  timer.stop()
  next()
}

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractPHP (req, res, next) {
  var log = logger.child({
    languageFramework: req.languageFramework,
    method: 'extractPHP'
  })
  log.info('extractPHP')
  const timer = monitorDog.timer('actions-analyze-index.extractPHP', true, [
    'dependencyFile:' + req.dependencyFile.name,
    'languageFramework:' + req.languageFramework
  ])
  var depFile
  try {
    depFile = JSON.parse(req.dependencyFileContent)
  } catch (e) {
    log.trace({ query: req.query }, 'invalid composer.json')
  }
  // composer uses key 'require'
  req.dependencyList = !isObject(keypath.get(depFile, 'require'))
    ? []
    : Object.keys(depFile.require)
  req.inferredLanguageVersion = {
    php: req.supportedLanguageVersions.defaultVersion
  }
  timer.stop()
  next()
}

/**
 * Determine which keys in suggestableServices have modules in their
 * value-arrays that are present in a project's list of dependencies
 *
 * matches if known module match is a substring of the project's module in comparison
 *
 * @param projectModules Array list of modules used in project
 * @param suggestableServices Object {serviceName: [...list of popular modules
 *   for interfacing with service...]}
 */
function inferDependenciesFromDependencyList (req, res, next) {
  logger.trace('inferDependenciesFromDependencyList ')
  var suggestableServices,
    suggestableServicesKeys
  switch (req.languageFramework) {
    case javascriptNodeJS:
      suggestableServicesKeys = Object.keys(suggestableServicesNode)
      suggestableServices = suggestableServicesNode
      break
    case rubyRor:
      suggestableServicesKeys = Object.keys(suggestableServicesRuby)
      suggestableServices = suggestableServicesRuby
      break
    case python:
      suggestableServicesKeys = Object.keys(suggestableServicesPython)
      suggestableServices = suggestableServicesPython
      break
    case php:
      suggestableServicesKeys = Object.keys(suggestableServicesPHP)
      suggestableServices = suggestableServicesPHP
      break
  }
  const timer = monitorDog.timer('actions-analyze-index.inferDependenciesFromDependencyList', true, [])
  var inferredServices = suggestableServicesKeys.filter(function (key) {
    return find(suggestableServices[key], function (moduleThatMatchesSuggestableService) {
      return find(req.dependencyList, function (dependencyInProject) {
        return dependencyInProject.toLowerCase() ===
        moduleThatMatchesSuggestableService.toLowerCase()
      })
    })
  })
  timer.stop()
  req.inferredDependencies = inferredServices
  next()
}

/**
 * format response for /actions/analyze
 */
function formatResponse (req, res, next) {
  req.formattedResponse = {
    languageFramework: req.languageFramework,
    version: req.inferredLanguageVersion,
    serviceDependencies: req.inferredDependencies
  }
  next()
}

/**
 * format response for /actions/analyze/info
 */
function formatInfoResponse (req, res, next) {
  req.formattedResponse = stacks
  next()
}

/**
 * Return formatted information to aid
 * creation of Dockerfile for requested repo(s)
 * @returns {} TODO:detail
 */
app.get('/actions/analyze',
  mw.query('repo').pick(),
  mw.query('repo').string(),
  mw.req().set('repositoryRootDir', 'githubResult'),
  function (req, res, next) {
    var github = new GitHub({
      token: keypath.get(req, 'sessionUser.accounts.github.accessToken')
    })
    github.getRepoContent(req.query.repo, '')
      .tap(function (result) {
        req.repositoryRootDir = result
      })
      .asCallback(next)
  },
  checkForDependencyFiles,
  mw.req().set('dependencyFileContent', 'dependencyFile.content', base64ToUTF8),
  extractProjectDependencyList,
  inferDependenciesFromDependencyList,
  formatResponse,
  mw.res.json('formattedResponse')
)

/**
 * Return formatted language/framework support
 * information
 */
app.get('/actions/analyze/info',
  formatInfoResponse,
  mw.res.json('formattedResponse')
)
