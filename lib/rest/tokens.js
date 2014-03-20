var express = require('express');
var app = module.exports = express();
var tokens = require('middleware/tokens');
var me = require('middleware/me');
var utils = require('middleware/utils');

app.get('/',
  tokens.hasToken,
  tokens.returnToken);

app.post('/',
  // get user_id if user has one.. but dont throw error
  utils.unless(tokens.hasToken, utils.next),
  me.login('body'),
  tokens.createToken,
  tokens.returnToken);