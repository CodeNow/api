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

app.get('/actions/analyze/',
        mw.res.status(200),
        mw.res.send('ok'));
