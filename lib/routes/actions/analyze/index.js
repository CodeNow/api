'use strict';

/**
 * Actions; Analyze
 * - Determine components of a Dockerfile
 *   for a repository/project by analyzing
 *   the file contents of the repository/project.
 */

var app = module.exports = require('express')();
var debug = require('debug')('runnable-api:actions:analyze');
var find = require('101/find');
var flow = require('middleware-flow');
var github = require('middlewares/apis').github;
var hasKeypaths = require('101/has-keypaths');
var isObject = require('101/is-object');
var keypath = require('keypather')();
var mw = require('dat-middleware');
var validations = require('middlewares/validations');

var stacks = require('./data/stacks');
var suggestableServicesNode = require('./data/suggestable-services-nodejs');
var suggestableServicesPython = require('./data/suggestable-services-python');
var suggestableServicesRuby = require('./data/suggestable-services-ruby');

var javascript_nodejs = 'nodejs';
var ruby_ror = 'ruby_ror';
var python = 'python';

function base64ToUTF8 (val) {
  return new Buffer(val, 'base64').toString('utf8');
}

/**
 * fetch dependency file from github for different project types
 * respond w/ error if none found
 */
var checkForDependencyFiles = flow.or(
  mw.next(mw.Boom.badRequest('unknown language/framework type')),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'package.json'})))
    .then(mw.req().set('languageFramework', javascript_nodejs),
          mw.req().set('supportedLanguageVersions', stacks[javascript_nodejs]),
          github.model.getRepoContent('query.repo', '/package.json'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'Gemfile'})))
    .then(mw.req().set('languageFramework', ruby_ror),
          mw.req().set('supportedLanguageVersions', stacks.ruby),
          github.model.getRepoContent('query.repo', '/Gemfile'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'requirements.txt'})))
    .then(mw.req().set('languageFramework', python),
          mw.req().set('supportedLanguageVersions', stacks.python),
          github.model.getRepoContent('query.repo', '/requirements.txt'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  // backup language detection method, ask GitHub
  flow.series(
    github.model.getRepo('query.repo'),
    mw.req().set('githubRepo', 'githubResult'),
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
            .then(mw.req().set('languageFramework', javascript_nodejs),
                  mw.req().set('supportedLanguageVersions', stacks[javascript_nodejs])),
          mw.req('githubRepo.language').validate(validations.equals('Ruby'))
            .else(mw.Boom.badRequest())
            .then(mw.req().set('languageFramework', ruby_ror),
                  mw.req().set('supportedLanguageVersions', stacks.ruby)),
          mw.req('githubRepo.language').validate(validations.equals('Python'))
            .else(mw.Boom.badRequest())
            .then(mw.req().set('languageFramework', python),
                  mw.req().set('supportedLanguageVersions', stacks.python)))))
);

// TODO: Can I use flow.or to optimize
var extractProjectDependencyList = flow.series(
  mw.req('languageFramework')
    .validate(validations.equals(javascript_nodejs))
    .then(extractJS),
  mw.req('languageFramework')
    .validate(validations.equals(ruby_ror))
    .then(extractRuby),
  mw.req('languageFramework')
    .validate(validations.equals(python))
    .then(extractPython)
);

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractJS (req, res, next) {
  debug('extracting project dependency-modules for languageFramework: %s', req.languageFramework);
  var depFile;
  try {
    depFile = JSON.parse(req.dependencyFileContent);
  } catch (e) {
    debug('invalid package.json file', req.languageFramework, req.query.repo);
  }
  // some package.json files may not have dependencies key
  req.dependencyList = (!depFile || !depFile.dependencies || !isObject(depFile.dependencies)) ?
    [] : Object.keys(depFile.dependencies);
  var nodev = (keypath.get(depFile, 'engine.node') ||
               req.supportedLanguageVersions.defaultVersion);
  var npmv = (keypath.get(depFile, 'engine.npm') ||
              req.supportedLanguageVersions.defaultNpmVersion);
  req.inferredLanguageVersion = {
    nodejs: nodev,
    npm: npmv
  };
  next();
}

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractRuby (req, res, next) {
  debug('extracting project dependency-modules for languageFramework: %s', req.languageFramework);
  var dependencies = [];
  var gemfileDependenciesRegexPattern = /^(\s+)?gem\s+['"](\S+)['"]/gm;
  var execResult;
  while (execResult = gemfileDependenciesRegexPattern.exec(req.dependencyFileContent)) {
    dependencies.push(execResult[2]);
  }
  req.dependencyList = dependencies;
  req.inferredLanguageVersion = {
    ruby: req.supportedLanguageVersions.defaultVersion,
    rails: ''
  };
  next();
}

/**
 * extract list of modules required by project repository
 *
 * @param req.dependencyFileContent String contents of project dependency file
 * @return req.dependencyList Array list of of modules used in project
 */
function extractPython (req, res, next) {
  debug('extracting project dependency-modules for languageFramework: %s', req.languageFramework);
  var dependencies = [];
  var pythonDependenciesRegexPattern = /^([A-z0-9-_]+)/gm;
  var execResult;
  while (execResult = pythonDependenciesRegexPattern.exec(req.dependencyFileContent)) {
    dependencies.push(execResult[1]);
  }
  req.dependencyList = dependencies;
  req.inferredLanguageVersion = {
    python: req.supportedLanguageVersions.defaultVersion
  };
  next();
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
  debug('inferring suggestable dependencies from project dependency-modules');
  var suggestableServices,
      suggestableServicesKeys;
  switch (req.languageFramework) {
    case javascript_nodejs:
      suggestableServicesKeys = Object.keys(suggestableServicesNode);
      suggestableServices = suggestableServicesNode;
      break;
    case ruby_ror:
      suggestableServicesKeys = Object.keys(suggestableServicesRuby);
      suggestableServices = suggestableServicesRuby;
      break;
    case python:
      suggestableServicesKeys = Object.keys(suggestableServicesPython);
      suggestableServices = suggestableServicesPython;
      break;
  }
  var inferredServices = suggestableServicesKeys.filter(function (key) {
    return find(suggestableServices[key], function (moduleThatMatchesSuggestableService) {
      return find(req.dependencyList, function (dependencyInProject) {
        //return (dependencyInProject.toLowerCase()
        //          .indexOf(moduleThatMatchesSuggestableService.toLowerCase()) !== -1);
        return dependencyInProject.toLowerCase() ===
          moduleThatMatchesSuggestableService.toLowerCase();
      });
    });
  });
  req.inferredDependencies = inferredServices;
  next();
}

/**
 * format response for /actions/analyze
 */
function formatResponse (req, res, next) {
  req.formattedResponse = {
    languageFramework: req.languageFramework,
    version: req.inferredLanguageVersion,
    serviceDependencies: req.inferredDependencies
  };
  next();
}

/**
 * format response for /actions/analyze/info
 */
function formatInfoResponse (req, res, next) {
  req.formattedResponse = stacks;
  next();
}

/**
 * Return formatted information to aid
 * creation of Dockerfile for requested repo(s)
 * @returns {} TODO:detail
 */
app.get('/actions/analyze',
  mw.query('repo').pick(),
  mw.query('repo').string(),
  github.create({token: 'sessionUser.accounts.github.accessToken'}),
  github.model.getRepoContent('query.repo', ''),
  mw.req().set('repositoryRootDir', 'githubResult'),
  checkForDependencyFiles,
  mw.req().set('dependencyFileContent', 'dependencyFile.content', base64ToUTF8),
  extractProjectDependencyList,
  inferDependenciesFromDependencyList,
  formatResponse,
  mw.res.json('formattedResponse')
);

/**
 * Return formatted language/framework support
 * information
 */
app.get('/actions/analyze/info',
  formatInfoResponse,
  mw.res.json('formattedResponse')
);
