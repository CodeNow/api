'use strict';

var express = require('express');
var error = require('error');
var configs = require('configs');
var tokens = require('middleware/tokens');
var utils = require('middleware/utils');
// var Dogstatsyware = require('dogstatsyware');
var app = module.exports = express();

app.use(require('domains'));
if (configs.logExpress) {
  app.use(express.logger());
  app.use(function (req, res, next) {
    console.log(req.method, req.url);
    next();
  });
}
// FIXME: re-instate datadog
// app.use(Dogstatsyware({
//   service: 'api-server'
// }));
app.use(express.json());
app.use(express.urlencoded());
app.use('/token', require('./rest/tokens'));
app.use('/users', require('./rest/users'));
app.use(tokens.hasToken);
app.use('/projects', require('./rest/projects'));
app.use('/contexts', require('./rest/contexts'));
app.use(require('./rest/contexts/files')('/contexts/:id/files'));
// FIXME: delete images
// app.use('/runnables', require('./rest/images'));
// FIXME: delete images
// app.use('/images', require('./rest/images'));
// FIXME: replace with projects
// app.use('/feeds/images', require('./rest/feeds/images'));
// FIXME: refactor if still needed
// app.use(require('./rest/containers')('/users/:userId/runnables'));
// FIXME: rename channels to tags
// app.use('/channels', require('./rest/channels'));
// FIXME: delete implementations
// app.use('/users/me/implementations', require('./rest/implementations'));
// FIXME: delete specfications
// app.use('/specifications', require('./rest/specifications'));
// FIXME: delete categories (merge with channels/tags)
// app.use(require('./rest/categories'));
// FIXME: delete campaigns
// app.use(require('./rest/campaigns'));
// FIXME: restore cleanup to former glory
app.use('/cleanup', require('./rest/cleanup'));
// FIXME: restore emails route
// app.use(require('./rest/emails'));
app.use(app.router);
app.use(errorCaster); // must be above nodetime and rollbar!
app.use(mongooseErrorHandler);
app.use(sendIf400Error);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});


function sendIf400Error (err, req, res, next) {
  // only 401s and 404s for now bc they are spammy
  // continue to track 404s on container pages for analytics purposes
  var isContainerPage = (req.url.indexOf('/users/me/runnables/') === 0);
  if (err.code === 401 ||  (err.code === 404 && !isContainerPage)) {
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

function mongooseErrorHandler (err, req, res, next) {
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
      err = error(409, message);
    }
  }
  next(err);
}

function errorCaster (err, req, res, next) {
  if (err.isBoom) {
    // transform boom into our errors
    err = new error(err.output.payload.statusCode, err.toString() || err.output.payload.message);
  }
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
