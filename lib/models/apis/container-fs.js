'use strict';

var pathModule = require('path');
var request = require('request');
var url = require('url');
var boom = require('dat-middleware').Boom;

function formatURl(container, path) {
  var parsedHost = url.parse(container.host);
  return 'http://' +
    parsedHost.hostname +
    ':' +
    process.env.KRAIN_PORT +
    path;
}

function createRequeset(method, container, path, opts) {
  var req = {};
  req.url = formatURl(container, path, true);
  req.method = method;
  req.json = {};
  if(opts && typeof opts.body === 'object')  {
    req.json = opts.body;
  }
  if (opts && typeof opts.query === 'object') {
    req.qs(opts.query);
  }
  req.json.container = {
    root: container.id
  };
  return req;
}

function badRes(res) {
  if (res.statusCode >= 400 && res.statusCode < 500) {
    return boom.create(res.statusCode, 'error response from Krain', {
      krain: {
        uri: res.request.uri,
        statusCode: res.statusCode,
        info: res.body
      }
    });
  }

  return boom.badGateway('error response from Krain', {
    krain: {
      uri: res.request.uri,
      statusCode: res.statusCode,
      info: res.body
    }
  });
}

module.exports  = {
  list: function (container, pathToDir, cb) {
    // path must have trailing slash to ensure this is a file
    request(
      createRequeset('GET', container, pathModule.join(pathToDir,'/')),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 303) {
          // this is a file, return empty array
          cb(null, []);
        } else if (res.statusCode !== 200) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
      });
  },

  get: function (container, path, cb) {
    request(
      createRequeset('GET', container, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 200) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
      });
  },
  patch: function (container, path, newObject, cb) {
    request(
      createRequeset('POST', container, path, {
        body: newObject
      }),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 201) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
      });
  },
  post: function (container, path, data, cb) {
    request(
      createRequeset('POST', container, path, {
        body: data
      }),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 201) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
      });
  },
  put: function (container, path, cb) {
    request(
      createRequeset('PUT', container, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 201) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
      });
  },
  del: function (container, path, cb) {
    request(
      createRequeset('DELETE', container, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode !== 200) {
          cb(badRes(res));
        } else {
          cb(null);
        }
      });
  }
};
