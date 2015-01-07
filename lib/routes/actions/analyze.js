'use strict';

/**
 * Actions; Analyze
 * - Determine components of a Dockerfile
 *   for a repository/project by analyzing
 *   the file contents of the repository/project.
 */

var app = module.exports = require('express')();
var flow = require('middleware-flow');
var github = require('middlewares/apis').github;
var hasKeypaths = require('101/has-keypaths');
var mw = require('dat-middleware');
var validations = require('middlewares/validations');

var suggestableServices = {
  'mongodb': [
    'mongo',
    'mongodb',
    'mongoose',
    'sails-mongo'
  ],
  'redis': [
    'redis',
    'redis-api'
  ],
  'mysql': [
    'mysql',
    'sequelize'
  ]
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
  switch (req.languageFramework) {
    case 'javascript_nodejs':
      break;
    case 'ruby_ror':
      break;
    case 'python':
      break;
  }
}

/**
 *
 */
/*
function inferDependencies (req, res, next) {
  var dependencyFile = find(req.repositoryRootDir, function (file) {
    return file.name === 'package.json' ||
           file.name === 'Gemfile' ||
           file.name === 'requirements.txt';
  });
  var buffer = new Buffer(dependencyFile.content, 'base64');
  var content = JSON.parse(buffer.toString('ascii'));
  switch (dependencyFile.name) {
    case 'Gemfile':
      inferRubyDependencies();
      break;
    case 'package.json':
      inferNodeDependencies(Object.keys(content.dependencies), suggestableServices);
      break;
  }
  next();
}
*/
/**
 * Determine which keys in suggestableServices have modules in their
 * value-arrays that are present in a project's list of dependencies
 *
 * @param projectModules Array list of modules used in project
 * @param suggestableServices Object {serviceName: [...list of popular modules for interfacing with service...]}
 */
function inferDependencies (projectModules, suggestableServices) {
  debugger;
  //var projectDependencies = Object.keys(dependencyFile.dependencies);
  var inferredServices = Object.keys(suggestableServices).filter(function (key) {
    var matchingModulesForSuggestableService = suggestableServices[key];
    return matchingModulesForSuggestableService.filter(function (mm) {
      return projectModules.filter(function (pm) {
        return mm.toLowerCase().indexOf(pm.toLowerCase()) !== -1;
      });
    });
  });
  console.log('inferredServices', inferredServices);
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
  /**
   * NOTE: linking to local dat-middleware until
   * TJ pulls PR into dat-middleware. Following
   * wont work on other systems until then.
   */
  mw.req().set('dependencyFileContent', 'dependencyFile.content', function (val) {
    return new Buffer(val, 'base64').toString('utf8');
  }),
  mw.res.status(200),
  mw.res.send('ok')
);
