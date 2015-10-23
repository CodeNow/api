/**

 * Sauron is used to alloc/dealloc internal ips for containers
 * @module lib/models/apis/sauron
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var SauronClient = require('sauron-client');

var put = require('101/put');

var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = Sauron;

var errorIs = {
  containerNotRunning: function (err) {
    return /not running/.test(err.message);
  },
  containerDied: function (err) {
    return /died/.test(err.message);
  },
  containerNotMappedToIp: function (err) {
    return err.output.statusCode === 409 && /not mapped/.test(err.message);
  },
  ipNotFound: function (err) {
    return err.output.statusCode === 404 && /not have ip/.test(err.message);
  },
  ipMappedToDiff: function (err) {
    return err.output.statusCode === 409 && /not have ip/.test(err.message);
  }
};

/**
 * Operations alloc/dealloc internal ips for containers
 * @class
 * @param {String} host
 * @return null
 */
function Sauron (host) {
  this.logData = {
    tx: true,
    host: host
  };
  log.info(this.logData, 'Sauron constructor');
  var port = process.env.SAURON_PORT;
  this.client = new SauronClient(host, port, {
    retryCount: 5
  });
  this.host = host;
  this.hostNotProvided = false;
}

// NETWORKS

// CONTAINERS
/**
 * Get container host ip
 * @param  {Container} containerId docker container Id
 * @param  {Function}  cb          callback
 */
Sauron.prototype.getContainerIp = function (containerId, cb) {
  log.info(put({
    containerId: containerId
  }, this.logData), 'Sauron.prototype.getContainerIp');
  this.client.getContainerIp(containerId, this.handleResErr(function (err, info) {
    if (err) {
      if (errorIs.ipNotFound(err)) {
        cb(null, null);
      }
      else {
        cb(err);
      }
    }
    else {
      cb(null, info.ip);
    }
  }, 'Get container ip failed', { containerId: containerId }));
};

Sauron.prototype.handleResErr = function (cb, message, inputData) {
  inputData = inputData || {};
  var self = this;
  return function (err, res) {
    if (err) {
      cb(self.unavailableErr(inputData, message, err));
    }
    else if (res.statusCode >= 300) {
      var statusCode = res.statusCode === 500 ? 502 : res.statusCode;
      message = res.body.message ? message+': '+res.body.message : message;
      cb(Boom.create(statusCode, message, {
        debug: {
          sauron: {
            input: inputData,
            statusCode: res.statusCode,
            body: res.body
          }
        }
      }));
    }
    else {
      cb(err, res.body, res);
    }
  };
};

Sauron.prototype.unavailableErr = function (inputData, message, err) {
  log.error(put({
    input: inputData,
    message: message,
    err: err
  }, this.logData), 'Sauron.prototype.unavailableErr');
  var boomErr = Boom.create(504, message+': temporarily unavailable', {
    sauron: {
      host: this.host,
      input: inputData
    },
    err: err
  });
  return boomErr;
};
