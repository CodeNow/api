var express = require('express');
var error = require('error');
var configs = require('configs');
var tokens = require('middleware/tokens');
var utils = require('middleware/utils');
var app = module.exports = express();
app.use(require('domains'));
if (configs.logExpress) {
  app.use(express.logger());
  app.use(function (req, res, next) {
    console.log(req.method, req.url);
    next();
  });
}
app.use(express.json());
app.use(express.urlencoded());
app.use('/token', require('./rest/tokens'));
app.use('/users', require('./rest/users'));
app.use(tokens.hasToken);
app.use('/runnables', require('./rest/images'));
app.use('/images', require('./rest/images'));
app.use(require('./rest/containers')('/users/:userId/runnables'));
app.use(require('./rest/containers')('/containers'));
app.use('/channels', require('./rest/channels'));
app.use('/users/me/implementations', require('./rest/implementations'));
app.use('/specifications', require('./rest/specifications'));
app.use(require('./rest/categories'));
app.use(require('./rest/campaigns'));
app.use('/cleanup', require('./rest/cleanup'));
app.use(app.router);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(errorCaster);
  app.use(require('rollbar').errorHandler());
}
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
app.use(mongooseErrorHandler);

function mongooseErrorHandler (err, req, res, next) {
  if (err.name === 'MongoError') {
    if (err.code === 11000) {
      var resourceAliases = {
        image: 'runnable',
        container: 'draft'
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
  if (err instanceof Error) {
    next(err);
  }
  else {
    err = new Error(JSON.stringify(err));
    next(err);
  }
}