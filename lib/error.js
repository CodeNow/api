'use strict';

// var rollbar = require('rollbar');
var Boom = require('dat-middleware').Boom;
var extend  = require('extend');

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
  if (err.data && err.data.docker) {
    console.error('---docker error---');
    console.error(err.data.docker.dockerHost);
    console.error(err.data.docker.port);
    console.error(err.data.docker.cmd);
  }
  if (err.data && err.data.res) {
    console.error('---error response---');
    console.error(err.data.res.statusCode);
    console.error(err.data.res.body);
  }
};
error.wrapIfErr = function (cb, status, message, data) {
  return function (err) {
    var errData = {};
    if (err && err.isBoom) {
      errData = err.data || { err: err };
    } else {
      errData = {err:err};
    }
    if (err) {
      extend(errData, data);
      cb(Boom.create(status, message, errData));
    }
    else {
      cb.apply(this, arguments);
    }
  };
};

/**
 * errorHandler middlewares
 */
var inflect = require('i')();

error.errorCaster = function (err, req, res, next) {
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
};

error.mongooseErrorCaster = function (err, req, res, next) {
  function handMongoError (err) {
    if (err.code === 11000) {
      var resourceAliases = {
        me: 'user'
      };
      var fieldAliases = {
        aliases: 'name',
        lowerUsername: 'username'
      };
      var match = /([^.]+).\$([^_]+)_/.exec(err.err);
      var resource = inflect.singularize(match[1]);
      resource = resourceAliases[resource] || resource;
      var field = fieldAliases[match[2]] || match[2];
      var message = resource + ' with ' + field + ' already exists';
      err = error(409, message, { err: err });
    }
    return err;
  }
  function handValidationError (err) {
    var note = Object.keys(err.errors).map(function (key) {
      return err.errors[key].message;
    }).join('\n');
    err = error(400, note, { err: err });
    return err;
  }

  if (err.name === 'MongoError') {
    err = handMongoError(err);
  } else if (err.name === 'ValidationError') {
    err = handValidationError(err);
  }
  next(err);
};

error.sendIf400Error = function (err, req, res, next) {
  // only 401s and 404s for now bc they are spammy
  // continue to track 404s on container pages for analytics purposes
  if (err.isBoom && err.output.statusCode === 401) {
    err.reformat();
    res.json(err.output.statusCode, err.output.payload);
  }
  else {
    next(err);
  }
};

error.errorHandler = function (err, req, res, next) {
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err });
  }
  err.reformat();
  if (process.env.LOG_ERRORS) {
    if (err.output.statusCode >= 500) {
      console.error('Bad App Error: ',
        err.output.statusCode, req.method, req.url);
      error.log(err);
    }
    else {
      console.error('Acceptable App Error: ',
        err.output.statusCode, req.method, req.url, err.message);
    }
  }
  // if (err.output.statusCode === 500) {
  //   throw err;
  // }
  // else {
  res.json(err.output.statusCode, err.output.payload);
  // }
  next.lintIsStupidSometimes = true;
  // }
};
