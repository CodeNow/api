'use strict';

/**
 * Actions; Analyze
 * - Determine components of a Dockerfile
 *   for a repository/project by analyzing
 *   the file contents of the repository/project.
 */

var app = module.exports = require('express')();
var github = require('middlewares/apis').github;
var mw = require('dat-middleware');
var validations = require('middlewares/validations');

var supportedLanguages = [
  'JavaScript',
  'Python',
  'Ruby'
];

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
  github.model.getRepo('query.repo'),
  function (req, res, next) {
  //  console.log(req.githubResult);
  //  console.log(req.githubResult.language);
    next();
  },
  mw.req('githubResult.language')
    .validate(validations.notEquals(null)),
  mw.req('githubResult.language')
    .validate(validations.isInArray(supportedLanguages)),
  mw.res.status(200),
  mw.res.send('ok'));
