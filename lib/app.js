'use strict';

var express = require('express');
var error = require('error');
var configs = require('configs');
var tokens = require('middleware/tokens');
var utils = require('middleware/utils');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var error = require('error');
// var Dogstatsyware = require('dogstatsyware');
var app = module.exports = express();

app.use(require('domains'));
if (configs.logExpress) {
  app.use(morgan());
  app.use(function (req, res, next) {
    console.log(req.method, req.url);
    next();
  });
}
// FIXME: re-instate datadog
// app.use(Dogstatsyware({
//   service: 'api-server'
// }));
app.use(bodyParser());
app.use('/token', require('./rest/tokens'));
app.use('/users', require('./rest/users'));
app.use(tokens.hasToken);
app.use('/projects', require('./rest/projects/views'));
app.use('/projects', require('./rest/projects/contexts'));
app.use('/projects', require('./rest/projects/environments'));
app.use('/projects', require('./rest/projects'));
app.use('/contexts', require('./rest/contexts/files'));
app.use('/contexts', require('./rest/contexts'));
app.use('/containers', require('./rest/containers'));
// FIXME: replace with projects
// app.use('/feeds/images', require('./rest/feeds/images'));
// FIXME: refactor if still needed
// app.use(require('./rest/containers')('/users/:userId/runnables'));
// FIXME: rename channels to tags
// app.use('/channels', require('./rest/channels'));
// FIXME: delete categories (merge with channels/tags)
// app.use(require('./rest/categories'));
// FIXME: delete campaigns
// app.use(require('./rest/campaigns'));
// FIXME: restore cleanup to former glory
app.use('/cleanup', require('./rest/cleanup'));
// FIXME: restore emails route
// app.use(require('./rest/emails'));
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
app.use(errorCaster); // must be above nodetime and rollbar!
app.use(mongooseErrorCaster);
app.use(sendIf400Error);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}
app.use(error.errorHandler);


function sendIf400Error (err, req, res, next) {
  // only 401s and 404s for now bc they are spammy
  // continue to track 404s on container pages for analytics purposes
  if (err.isBoom && err.output.statusCode === 401) {
    res.json(err.code, {
      message: err.msg,
      stack: configs.throwErrors ?
        err.stack : undefined
    });
  }
  else {
    next(err);
  }
}

function mongooseErrorCaster (err, req, res, next) {
  if (err.name === 'MongoError') {
    if (err.code === 11000) {
      var resourceAliases = {
        image: 'runnable',
        container: 'draft',
        me: 'user'
      };
      var fieldAliases = {
        aliases: 'name',
        lower: 'username'
      };
      var match = /([^.]+).\$([^_]+)_/.exec(err.err);
      var resource = utils.singularize(match[1]);
      resource = resourceAliases[resource] || resource;
      var field = fieldAliases[match[2]] || match[2];
      var message = resource + ' with ' + field + ' already exists';
      err = error(409, message, { err: err });
    }
  }
  next(err);
}

function errorCaster (err, req, res, next) {
  if (err instanceof Error) {
    next(err);
  }
  else {
    try {
      err = new Error(JSON.stringify(err));
    }
    catch (stringifyErr) {
      err = new Error(err+'');
    }
    next(err);
  }
}
