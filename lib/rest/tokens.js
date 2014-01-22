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
  or(body.require('username'), body.require('email')),
  body.require('password'),
  users.findByUsernameOrEmail,
  users.checkPassword,
  containers.updateOwnerToUser,
  tokens.createToken,
  tokens.returnToken);