var express = require('express');
var app = module.exports = express();
var tokens = require('middleware/tokens');
var users = require('middleware/users');
var containers = require('middleware/containers');
var body = require('middleware/body');
var or = require('middleware/utils').or;

app.get('/',
  tokens.hasToken,
  tokens.returnToken);

app.post('/',
  body.pick('username', 'email', 'password'),
  body.requireOne('username', 'email'),
  body.require('password'),
  users.login('body'),
  tokens.createToken,
  tokens.returnToken);