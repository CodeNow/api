'use strict';

var pathModule = require('path');
var configs = require('configs');
var error = require('error');
var request = require('request');

function formatURl(containerId, host, path) {
  return 'http://' +
    host +
    ':' +
    configs.krainPort +
    path;
}

function createRequeset(method, containerId, host, path, opts) {
  var req = {};
  req.url = formatURl(containerId, host, path, true);
  req.method = method;
  req.json = {};
  if(opts && typeof opts.body === 'object')  {
    req.json = opts.body;
  }
  req.json.container = {
    root: containerId
  };
  if (opts && typeof opts.query === 'object') {
    req.qs(opts.query);
  }
  return req;
}

module.exports  = {
  list: function (containerId, host, pathToDir, cb) {
    // path must have trailing slash to ensure this is a file
    request(
      createRequeset('GET', containerId, host, pathModule.join(pathToDir,'/')),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 303) {
          // this is a file, return empty array
          cb(null, []);
        } else if (res.statusCode !== 200) {
          cb(new Error(res.statusCode, 'error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },

  get: function (containerId, host, path, cb) {
    console.log("get", containerId, path);
    request(
      createRequeset('GET', containerId, host, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 200) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  patch: function (containerId, host, oldObject, newObject, cb) {
    console.log("PATCH", containerId, host, oldObject, newObject);
    var body = {
      name: newObject.name || oldObject.name,
      path: newObject.path || oldObject.path,
      isDir: newObject.isDir || oldObject.isDir,
      content: newObject.content || oldObject.content
    };
    request(
      createRequeset('POST',
        containerId,
        host,
        pathModule.join(oldObject.path, oldObject.name), {
        body: body
      }),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 200) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  post: function (containerId, host, path, cb) {
    console.log("POST", containerId, path);
    request(
      createRequeset('POST', containerId, host, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 201) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  put: function (containerId, host, path, cb) {
    console.log("PUT", containerId, path);
    request(
      createRequeset('PUT', containerId, host, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 201) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null, res.body);
        }
      });
  },
  del: function (containerId, host, path, cb) {
    console.log("DELETE", containerId, path);
    request(
      createRequeset('DELETE', containerId, host, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 200) {
          cb(error(res.statusCode, 'unknown error response from runnable'));
        } else {
          cb(null);
        }
      });
  },
}