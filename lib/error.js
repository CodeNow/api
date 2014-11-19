'use strict';

// var rollbar = require('rollbar');
var Boom = require('dat-middleware').Boom;
var extend  = require('extend');
var envIs = require('101/env-is');
var pick = require('101/pick');
var noop = require('101/noop');
var rollbar = require('rollbar');
if (process.env.ROLLBAR_KEY) {
  rollbar.init(process.env.ROLLBAR_KEY, {
    environment: process.env.NODE_ENV || 'development',
    branch: process.env._VERSION_GIT_BRANCH,
    codeVersion: process.env._VERSION_GIT_COMMIT,
    root: process.env.ROOT_DIR
  });
}


var error = module.exports = function (code, msg, data) {
  return Boom.create(code, msg, data);
};
/*jshint maxcomplexity:20*/
function log (err) {
  console.error(err.message);
  console.error(err.stack);
  if (err.data) {
    if (err.data.err) {
      console.error('---original error---');
      console.error(err.data.err.message);
      console.error(err.data.err.stack);
    }
    if (err.data.docker) {
      console.error('---docker error---');
      console.error(err.data.docker.dockerHost);
      console.error(err.data.docker.port);
      console.error(err.data.docker.cmd);
      console.error(err.data.docker.containerId);
      console.error(err.data.docker.log);
    }
    if (err.data.krain) {
      console.error('---krain error---');
      console.error(err.data.krain.uri);
      console.error(err.data.krain.statusCode);
      console.error(err.data.krain.info);
    }
    if (err.data.mavis) {
      console.error('---mavis error---');
      console.error(err.data.mavis.uri);
      console.error(err.data.mavis.statusCode);
      console.error(err.data.mavis.info);
    }
    if (err.data.route53) {
      console.error('---route53 error---');
      console.error(err.data.route53);
    }
    if (err.data.s3) {
      console.error('---s3 error---');
      console.error(err.data.s3.bucket);
      console.error(err.data.s3.contextId);
      console.error(err.data.s3.sourcePath);
      console.error(err.data.s3.sourceUrl);
    }
    if (err.data.res) {
      console.error('---error response---');
      console.error(err.data.res.statusCode);
      console.error(err.data.res.body);
    }
    if (err.data.debug) {
      console.error('---error debug info---');
      console.error(err.data.debug);
    }
  }
  if (!envIs('test')) {
    report(err);
  }
}

function report (err) {
  var custom = err.data || {};
  var req = custom.req;
  delete custom.req;
  if (custom.err) {
    var errKeys;
    try {
      errKeys = Object.keys(custom.err);
    }
    catch (err) {
      errKeys = [];
    }
    custom.err = pick(custom.err, ['message', 'stack'].concat(errKeys));
  }
  rollbar.handleErrorWithPayloadData(err, { custom: custom }, req, noop);
}

error.log = function (err, req) {
  /*jshint maxdepth:5*/
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err });
    err.reformat();
  }
  if (process.env.LOG_ERRORS) {
    if (!req || !req.url || !req.method) {
      req = null;
    }
    var statusCode = err.output.statusCode;
    if (statusCode >= 500) {
      console.error('Bad App Error: ',
        statusCode,
        req ? req.method : 'unknown url',
        req ? req.url : 'unknown method');
    }
    else {
      console.error('Acceptable App Error: ',
        statusCode,
        req ? req.method : 'unknown url',
        req ? req.url : 'unknown method',
        err.message);
      if (err.data && Object.keys(err.data).length) {
        console.error(err.data);
      }
    }
    if (!envIs('test') || statusCode >= 500) {
      err.data = err.data || {};
      err.data.req = req;
      log(err);
    }
  }
};

error.logIfErrMw = function (err, req, res, next) {
  error.log(err, req);
  next();
};

error.logIfErr = function (err, req) {
  if (err) {
    error.log(err, req);
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
    if (error.isMongoAlreadyExistsError(err)) {
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

/* jshint unused:false */ // middleware arguments length matters
error.errorHandler = function (err, req, res, next) {
  if (!err.isBoom) {
    err = error(500, 'unknown', { err: err });
  }
  err.reformat();
  if (process.env.LOG_ERRORS) {
    error.log(err, req);
  }
  // if (err.output.statusCode === 500) {
  //   throw err;
  // }
  // else {
  res.json(err.output.statusCode, err.output.payload);
  // }
};
/* jshint unused:true */
error.isMongoAlreadyExistsError = function (err) {
  return err.code === 11000 || err.code === 11001;
};
