'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */
var express = require('express');
var flow = require('middleware-flow');
var keypather = require('keypather')();
var middlewarize = require('middlewarize');
var mw = require('dat-middleware');
var noop = require('101/noop');
var pluck = require('101/pluck');


var app = module.exports = express();



app.post('/actions/internal/deprovision-clusters');
