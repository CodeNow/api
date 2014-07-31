'use strict';

var util = require('util');
var Boom = require('dat-middleware').Boom;
var ApiClient = require('simple-api-client');
var request = require('request');

module.exports = Docklet;

function Docklet () {
  this.url = '';
  this.request = this.request.defaults({ json:true, pool:false });
}

util.inherits(Docklet, ApiClient);

/** returns optimal dock to run task on
 * params:
 *  taskType: type of task to run ['container_run'|'container_build']
 * OPTIONAL:
 *  prevDock: prev dock this task was run on
*/
Docklet.prototype.findDock = function (taskType, prevDock, cb) {
  // path must have trailing slash to ensure this is a file
  console.log('anand',taskType, prevDock, process.env.MAVIS_HOST);
  request.post({
    url: process.env.MAVIS_HOST + '/dock',
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

    console.log('DOCK', res.body.dockHost);
    return cb(null, res.body.dockHost);
  });
};
