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
var mw = require('dat-middleware');
var validations = require('middlewares/validations');

var suggestableServices = {
  // service name
  'mongodb': [
    // common modules for this service
    'best-mongo',
    'mongo',
    'mongo-bluebird',
    'mongodb',
    'mongoose',
    'sails-mongo'
  ],
  'mysql': [
    'mysql',
    'sequelize'
  ],
  'postgresql': [
  ],
  'rabbitmq': [
  ],
  'redis': [
    'kue',
    'node-redis-session',
    'redis',
    'redis-api',
    'redis-fast-driver',
    'redis-sentinel',
    'reds'
  ]
};

var suggestableServicesRuby = {
  'mongodb': [],
  'mysql': [],
  'postgresql': [],
  'rabbitmq': [],
  'redis': []
};

var checkForDependencyFiles = flow.or(
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'package.json'})))
    .then(mw.req().set('languageFramework', 'javascript_nodejs'),
          github.model.getRepoContent('query.repo', '/package.json'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'Gemfile'})))
    .then(mw.req().set('languageFramework', 'ruby_ror'),
          github.model.getRepoContent('query.repo', '/Gemfile'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest()),
  mw.req('repositoryRootDir')
    .validate(validations.isInArray(hasKeypaths({name: 'requirements.txt'})))
    .then(mw.req().set('languageFramework', 'python'),
          github.model.getRepoContent('query.repo', '/requirements.txt'),
          mw.req().set('dependencyFile', 'githubResult'))
    .else(mw.Boom.badRequest())
);

/**
 * extract list of modules required by project repository
 */
function extractDependencyList (req, res, next) {
  debug('extracting project dependency-modules for languageFramework: %s', req.languageFramework);
  var dependencies;
  switch (req.languageFramework) {
    case 'javascript_nodejs':
      var depFile = JSON.parse(req.dependencyFileContent);
      dependencies = Object.keys(depFile.dependencies);
      break;
    case 'ruby_ror':
      break;
    case 'python':
      break;
  }
  req.dependencyList = dependencies;
  next();
}

/**
 * Determine which keys in suggestableServices have modules in their
 * value-arrays that are present in a project's list of dependencies
 *
 * @param projectModules Array list of modules used in project
 * @param suggestableServices Object {serviceName: [...list of popular modules 
 *   for interfacing with service...]}
 */
function inferDependenciesFromDependencyList (req, res, next) {
  debug('inferring suggestable dependencies from project dependency-modules');
  var suggestableServicesKeys = Object.keys(suggestableServices);
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
  github.create({
    token: 'sessionUser.accounts.github.accessToken'
  }),
  github.model.getRepoContent('query.repo', ''),
  mw.req().set('repositoryRootDir', 'githubResult'),
  checkForDependencyFiles,
  mw.req().set('dependencyFileContent',
               'dependencyFile.content',
               function (val) {
                 return new Buffer(val, 'base64').toString('utf8');
               }),
  extractDependencyList,
  inferDependenciesFromDependencyList,
  mw.res.json('inferredDependencies')
);
