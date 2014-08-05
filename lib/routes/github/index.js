'use strict';

var express = require('express');
var app = module.exports = express();
var checkFound = require('middlewares/check-found');
var github = require('middlewares/apis').github;
var mw = require('dat-middleware');

var createGithub = github.create({ token: 'sessionUser.accounts.github.accessToken' });

app.get('/user/orgs',
  createGithub,
  github.model.getUserAuthorizedOrgs(),
  checkFound('githubResult'),
  mw.res.json(200, 'githubResult'));

app.get('/orgs/:orgname/repos',
  createGithub,
  github.model.getOrgRepos('params.orgname'),
  checkFound('githubResult'),
  mw.res.json(200, 'githubResult'));

app.get('/user/repos',
  createGithub,
  github.model.getUserRepos('sessionUser.accounts.github.username'),
  checkFound('githubResult'),
  mw.res.json(200, 'githubResult'));

app.get('/repos/:owner/:repo/branches',
  createGithub,
  function (req, res, next) {
    req.fullRepo = req.params.owner + '/' + req.params.branch;
    next();
  },
  github.model.getBranches('fullRepo'),
  mw.res.json(200, 'githubResult'));
