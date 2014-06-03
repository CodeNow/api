'use strict';

var pathModule = require('path');
var configs = require('configs');
var error = require('error');
var request = require('request');

function formatURl(container, path) {
  return 'http://' +
    container.host +
    ':' +
    configs.krainPort +
    pathModule.join(container.file_root, path);
}

function createRequeset(method, container, path, opts) {
  var req = {};
  req.url = formatURl(container, path, true);
  req.method = method;
  req.json = {};
  if(opts && typeof opts.body === 'object')  {
    req.json = opts.body;
  }
  req.json.container = {
    root: container.containerId
  };
  if (opts && typeof opts.query === 'object') {
    req.qs(opts.query);
  }
  return req;
}

module.exports  = {
  get: function (container, path, cb) {
    console.log("get", container.containerId, path);
    request(
      createRequeset('GET', container, path, false),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 502) {
          cb(error(500, 'runnable not responding to file requests'));
        } else if (res.statusCode !== 200) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  post: function (container, path, cb) {
    console.log("POST", container.containerId, path);
    request(
      createRequeset('POST', container, path, false),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 502) {
          cb(error(500, 'runnable not responding to file requests'));
        } else if (res.statusCode !== 200) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  put: function (container, path, cb) {
    console.log("PUT", container.containerId, path);
    request(
      createRequeset('PUT', container, path, false),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 502) {
          cb(error(500, 'runnable not responding to file requests'));
        } else if (res.statusCode !== 201) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  del: function (container, path, cb) {
    console.log("DELETE", container.containerId, path);
    request(
      createRequeset('DELETE', container, path, false),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 502) {
          cb(error(500, 'runnable not responding to file requests'));
        } else if (res.statusCode !== 200) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null);
        }
      });
  },
}