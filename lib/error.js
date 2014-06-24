'use strict';

// var rollbar = require('rollbar');
var Boom = require('dat-middleware').Boom;
var configs = require('configs');
var extend  = require('xtend');

var error = module.exports = function (code, msg, data) {
  return Boom.create(code, msg, data);
};

error.log = function (err) {
  console.error(err.message);
  console.error(err.stack);
  if (err.data && err.data.err) {
    console.error('---original error---');
    console.error(err.data.err.message);
    console.error(err.data.err.stack);
  }
};
error.wrapIfErr = function (cb, status, message, data) {
  return function (err) {
    var errData = {};
    if (err && err.isBoom) {
      errData = err.data || {};
    }
    if (err) {
      errData = extend(data, errData);
      cb(Boom.create(status, message, errData));
    }
    else {
      cb.apply(this, arguments);
    }
  };
};

var app = require('express')();
error.errorHandler = app;


/**
 * errorHandler middlewares
 */
var inflect = require('i')();

app.use(errorCaster); // must be above nodetime and rollbar!
app.use(mongooseErrorCaster);
app.use(sendIf400Error);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}
app.use(errorHandler);

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
      var resource = inflect.singularize(match[1]);
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

function errorHandler (err, req, res, next) {
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err });
  }
  err.reformat();
  if (configs.logErrors && err.output.statusCode >= 500) {
    error.log(err);
  }
  // if (err.output.statusCode === 500) {
  //   throw err;
  // }
  // else {
  res.json(err.output.statusCode, err.output.payload);
  next.lintIsStupidSometimes = true;
  // }
}