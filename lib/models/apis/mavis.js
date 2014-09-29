'use strict';

/* Mavis is used to find a dock */

var ApiClient = require('simple-api-client');
var util = require('util');
var Boom = require('dat-middleware').Boom;

module.exports = Mavis;

function Mavis (opts) {
  this.host = process.env.MAVIS_HOST;
  ApiClient.call(this, this.host, opts);
}

util.inherits(Mavis, ApiClient);

/**
 * ask mavis for dock to run provided task on
 * @param taskType: ['container_build', 'container_run']
 * @param prevDock: previous dock this image was run on
 * @param cb: Callback
 */
Mavis.prototype.findDock = function (taskType, prevDock, cb) {
  if (typeof prevDock === 'function') {
    cb = prevDock;
    prevDock = null;
  }
  // path must have trailing slash to ensure this is a file
  this.post('dock', {
    json: {
      type: taskType,
      prevDock: prevDock
    }
  }, function (err, res) {
    if (err) {
      cb(err);
    }
    else if (res.statusCode >= 300) {
      cb(responseError(res));
    }
    else {
      cb(null, res.body.dockHost);
    }
  });
};

function responseError (res) {
  var message;
  var code;
  if (res.statusCode >= 500) {
    message = 'Unknown error from mavis';
    code = 502;
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

// TODO: add all the findDock types
// Mavis.prototype.findDockForContainerCreate

