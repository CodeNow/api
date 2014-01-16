var express = require('express');
var app = module.exports = express();
var redis = require('../models/redis');
var users = require('../models/users');
var uuid = require('node-uuid');
var configs = require('../configs');
var runnables = require('../models/runnables');

app.get('/', function (req, res) {
  var token = req.get('runnable-token');
  if (token) {
    res.send(200, token);
  } else {
    res.send(404);
  }
});
app.post('/', function (req, res) {
  if (req.body.username == null && req.body.email == null) {
    res.json(400, { message: 'username or email required' });
  } else if (req.body.password == null) {
    res.json(400, { message: 'password required' });
  } else {
    var identity = req.body.email || req.body.username;
    users.loginUser(req.domain, identity, req.body.password, req.domain.intercept(function (user_id) {
      var response = function () {
        var access_token;
        access_token = uuid.v4();
        redis.psetex([
          access_token,
          configs.tokenExpires,
          user_id
        ], req.domain.intercept(function () {
          res.json({ access_token: access_token });
        }));
      };
      var token = req.get('runnable-token');
      if (!token) {
        response();
      } else {
        redis.get(token, req.domain.intercept(function (old_user_id) {
          if (!old_user_id) {
            response();
          } else {
            users.findUser(req.domain, { _id: old_user_id }, req.domain.intercept(function (old_user) {
              if (old_user.password) {
                response();
              } else {
                runnables.migrateContainers(req.domain, old_user_id, user_id, req.domain.intercept(function () {
                  response();
                }));
              }
            }));
          }
        }));
      }
    }));
  }
});