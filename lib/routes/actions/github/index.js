'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');

var versions = require('middlewares/mongo').contextVersions;
var contexts = require('middlewares/mongo').contexts;
var builds = require('middlewares/mongo').builds;

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
app.post('/',
  mw.headers('user-agent').require().matches(/^GitHub Hookshot.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.send(204)),
  mw.headers('x-github-event').matches(/^push$/).then(
    contexts.findByRepository('body.repository.owner.name', 'body.repository.name'),
    contexts.checkFound,
    builds.findLatestBuildsForContext('context'),
    versions.createAllNewVersions,
    versions.buildAllNewVersions,
    builds.createNewBuildsForNewVersions,
    mw.res.send(201)),
  mw.res.send(501));
