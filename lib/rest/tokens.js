var express = require('express');
var app = module.exports = express();
var tokens = require('middleware/tokens');
var me = require('middleware/me');
var containers = require('middleware/containers');
var body = require('middleware/body');
var or = require('middleware/utils').or;

app.get('/',
  tokens.hasToken,
  tokens.returnToken);

app.post('/',
  tokens.hasToken,
  me.login('body'),
  tokens.createToken,
  tokens.returnToken);