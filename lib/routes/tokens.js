'use strict';

var express = require('express');
var app = module.exports = express();
var flow = require('middleware-flow');

var me = require('middlewares/me');
var tokens = require('middlewares/tokens');
var utils = require('middlewares/utils');

app.get('/',
  tokens.hasToken,
  tokens.returnToken);

app.post('/',
  // get user_id if user has one.. but dont throw error
  flow.mwIf(tokens.hasToken).else(utils.next),
  // FIXME: remove utils.unless line below
  // utils.unless(tokens.hasToken, utils.next),
  me.login(),
  tokens.createToken,
  tokens.returnToken);
