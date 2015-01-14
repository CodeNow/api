'use strict';

/**
 * Actions; Analyze
 * - Determine components of a Dockerfile
 *   for a repository/project by analyzing
 *   the file contents of the repository/project.
 */

var app = module.exports = require('express')();
var debug = require('debug')('runnable-api:actions:analyze');
var flow = require('middleware-flow');
var github = require('middlewares/apis').github;
var hasKeypaths = require('101/has-keypaths');
var isObject = require('101/is-object');
var mw = require('dat-middleware');
var validations = require('middlewares/validations');

var suggestableServicesNode = require('./data/suggestable-services-nodejs');
var suggestableServicesPython = require('./data/suggestable-services-python');
var suggestableServicesRuby = require('./data/suggestable-services-ruby');

var supportedLanguageVersionsNode = require('./data/supported-language-versions-nodejs');
var supportedLanguageVersionsPython = require('./data/supported-language-versions-python');
var supportedLanguageVersionsRuby = require('./data/supported-language-versions-ruby');

var javascript_nodejs = 'node';
var ruby_ror = 'ruby_ror';
var python = 'python';

/**
 * fetch dependency file from github for different project types
 * respond w/ error if none found
 */
var checkForDependencyFiles = flow.or(
  mw.next(mw.Boom.badRequest('unknown language/framework type')),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'package.json'})))
    .then(mw.req().set('languageFramework', javascript_nodejs),
          mw.req().set('supportedLanguageVersions', supportedLanguageVersionsNode),
          github.model.getRepoContent('query.repo', '/package.json'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'Gemfile'})))
    .then(mw.req().set('languageFramework', ruby_ror),
          mw.req().set('supportedLanguageVersions', supportedLanguageVersionsRuby),
          github.model.getRepoContent('query.repo', '/Gemfile'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'requirements.txt'})))
    .then(mw.req().set('languageFramework', python),
          mw.req().set('supportedLanguageVersions', supportedLanguageVersionsPython),
          github.model.getRepoContent('query.repo', '/requirements.txt'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest())
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

function base64ToUTF8 (val) {
  return new Buffer(val, 'base64').toString('utf8');
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
  req.formattedResponse = {
    supportedLanguageVersions: {
      node: supportedLanguageVersionsNode.versions,
      python: supportedLanguageVersionsPython.versions,
      ruby: supportedLanguageVersionsRuby.versions
    }
  };
  next();
}

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
    req.dependencyList = [];
    return next();
  }
  // some package.json files may not have dependencies key
  req.dependencyList = (!depFile || !depFile.dependencies || !isObject(depFile.dependencies)) ?
    [] : Object.keys(depFile.dependencies);
  req.inferredLanguageVersion = depFile.engine || req.supportedLanguageVersions.default;
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
  req.inferredLanguageVersion = supportedLanguageVersionsRuby.default;
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
    // TODO: Optimize replacing filter w/ find (ES6-mode, polyfill, or 101)
    return suggestableServices[key].filter(function (moduleThatMatchesSuggestableService) {
      return req.dependencyList.filter(function (dependencyInProject) {
        return (dependencyInProject.toLowerCase()
                  .indexOf(moduleThatMatchesSuggestableService.toLowerCase()) !== -1);
      }).length;
    }).length;
  });
  req.inferredDependencies = inferredServices;
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
