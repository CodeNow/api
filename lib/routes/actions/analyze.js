'use strict';

/**
 * Actions; Analyze
 * - Determine components of a Dockerfile
 *   for a repository/project by analyzing
 *   the file contents of the repository/project.
 */

var express = require('express');
var app = module.exports = express();

var mw = require('dat-middleware');
var flow = require('middleware-flow');

/**
 * Return formatted information to aid
 * creation of Dockerfile for requested repo(s)
 * @returns {} TODO:detail
 */
app.get('/actions/analyze/',
  mw.query('repos').require(),
  flow.or(
    mw.query('repos').string(),
    mw.query('repos').array()
  ),
  mw.res.status(200),
  mw.res.send('ok'));
