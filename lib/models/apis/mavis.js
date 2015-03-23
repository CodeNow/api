'use strict';

/* Mavis is used to find a dock */

var ApiClient = require('simple-api-client');
var util = require('util');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:mavis:model');
var isObject = require('101/is-object');
var isFunction = require('101/is-function');

module.exports = Mavis;

function Mavis (opts) {
  this.host = process.env.MAVIS_HOST;
  debug('new Mavis', formatArgs(arguments), this.host);
  ApiClient.call(this, this.host, opts);
}

util.inherits(Mavis, ApiClient);

/**
 * ask mavis for any dock (for sauron network/host create/delete only!)
 * @param cb: Callback
 */
Mavis.prototype.findDockForNetwork = function (cb) {
  debug('findDockForNetwork', formatArgs(arguments));
  var opts =  {
    type: 'find_random_dock',
    prevDock: null
  };
  this.findDock(opts, cb);
};

Mavis.prototype.findDockForBuild = function (contextVersion, cb) {
  debug('findDockForBuild', formatArgs(arguments));

  if (!isObject(contextVersion)) {
    return cb(new Error('missing contextVersion'));
  }

  var opts =  {
    type: 'container_build'
  };
  opts.prevDuration = contextVersion.duration || 0;
  opts.prevImage = contextVersion.dockerTag || null;
  this.findDock(opts, cb);
};

Mavis.prototype.findDockForContainer = function (contextVersion, cb) {
  debug('findDockForContainer', formatArgs(arguments));

  if (!isObject(contextVersion)) {
    return cb(new Error('missing contextVersion'));
  }

  var opts =  {
    type: 'container_run'
  };
  // if dockerHost is not an address, its invalid
  opts.prevDock = contextVersion.dockerHost || null;
  this.findDock(opts, cb);
};

/**
 * ask mavis for dock to run provided task on
 * @param taskType: ['container_build', 'container_run']
 * @param prevDock: previous dock this image was run on
 * @param cb: Callback
 */
Mavis.prototype.findDock = function (opts, cb) {
  // path must have trailing slash to ensure this is a file
  var self = this;
  this.post('dock', {
    json: opts
  }, function (err, res) {
    if (err) {
      var boomErr = Boom.create(504, 'Unable to find dock', {
        mavis: {
          uri: self.host+'/dock'
        },
        err: err
      });
      cb(boomErr);
    }
    else if (res.statusCode >= 300) {
      cb(responseErr(res));
    }
    else {
      cb(null, res.body.dockHost);
    }
  });
};

function responseErr (res) {
  /*jshint maxcomplexity:10*/
  var message;
  var code;
  if (res.statusCode >= 500) {
    message = 'Unknown error from mavis';
    code = res.statusCode === 500 ?
      502:
      res.statusCode;
  }
  else if(res.statusCode >= 400) {
    message = 'Bad request error from mavis';
    code = res.statusCode;
  }
  else if(res.statusCode >= 300) {
    // mavis doesnt send redirects... so this is unexpected
    message = 'Unexpected response from mavis';
    code = 502;
  }
  if (res.body && res.body.message) {
    message += ': '+ res.body.message;
  }
  return Boom.create(code, message, {
    mavis: {
      uri: res.request.uri,
      statusCode: res.statusCode,
      info: res.body
    }
  });
}

function formatArgs (args) {
  return Array.prototype.slice.call(args)
    .map(function (arg) {
      return isFunction(arg) ?
        '[ Function '+(arg.name || 'anonymous')+' ]' :
        (args && arg._id || arg);
    });
}