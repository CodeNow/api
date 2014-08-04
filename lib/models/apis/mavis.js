'use strict';

/* Mavis is used to find a dock */

var ApiClient = require('simple-api-client');
var util = require('util');
var Boom = require('dat-middleware');

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
      return cb(Boom.badGateway('error from mavis', {
        mavis: {
          uri: res.request.uri,
          statusCode: res.statusCode,
          info: res.body
        }
      }));
    }
    if(res.statusCode < 500 && res.statusCode >= 400) {
      return cb(Boom.create(
        res.statusCode,
        'invalid response from mavis', {
        mavis: {
          uri: res.request.uri,
          statusCode: res.statusCode,
          info: res.body
        }
      }));
    }
    if(res.statusCode >= 300) {
      return cb(Boom.badGateway('invalid response from mavis', {
        mavis: {
          uri: res.request.uri,
          statusCode: res.statusCode,
          info: res.body
        }
      }));
    }

    return cb(null, res.body.dockHost);
  });
};

// TODO: add all the findDock types
// Mavis.prototype.findDockForContainerCreate