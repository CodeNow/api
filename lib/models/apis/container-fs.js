'use strict';

var pathModule = require('path');
var request = require('request');
var url = require('url');
var Boom = require('dat-middleware').Boom;
var dogstatsd = require('models/datadog');

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
  req.qs = {};
  if(opts && typeof opts.body === 'object')  {
    req.json = opts.body;
  }
  if (opts && typeof opts.query === 'object') {
    req.qs = opts.query;
  }
  req.qs.container = container.id;
  req.pool = false;
  return req;
}

function badRes(res) {
  var code = 500;
  if (res.statusCode >= 400 && res.statusCode < 500) {
    code = res.statusCode;
  }

  return Boom.create(code, 'error response from Krain', {
    krain: {
      uri: res.request.uri,
      statusCode: res.statusCode,
      info: res.body,
      req: res.request.body
    }
  });
}

module.exports  = {
  list: function (container, pathToDir, cb) {
    // path must have trailing slash to ensure this is a file
    var start = new Date();
    request(
      createRequeset('GET', container, pathModule.join(pathToDir,'/')),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode === 303) {
          // this is a file, return empty array
          cb(null, []);
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
        dogstatsd.timing('api.krain.request',
          new Date()-start,
          ['statusCode:'+res.statusCode, 'didErr:'+(err!==null), 'method:GET', 'call:list']);
      });
  },

  get: function (container, path, cb) {
    var start = new Date();
    request(
      createRequeset('GET', container, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
        dogstatsd.timing('api.krain.request',
          new Date()-start,
          ['statusCode:'+res.statusCode, 'didErr:'+(err!==null), 'method:GET', 'call:get']);
      });
  },
  patch: function (container, path, newObject, cb) {
    var start = new Date();
    request(
      createRequeset('POST', container, path, {
        body: newObject
      }),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
        dogstatsd.timing('api.krain.request',
          new Date()-start,
          ['statusCode:'+res.statusCode, 'didErr:'+(err!==null), 'method:POST', 'call:patch']);
      });
  },
  post: function (container, path, data, cb) {
    var start = new Date();
    request(
      createRequeset('POST', container, path, {
        body: data
      }),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
        dogstatsd.timing('api.krain.request',
          new Date()-start,
          ['statusCode:'+res.statusCode, 'didErr:'+(err!==null), 'method:POST', 'call:post']);
      });
  },
  postStream: function (container, path, stream, cb) {
    var start = new Date();
    var r = request(
      createRequeset('POST', container, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(badRes(res));
        } else {
          cb(null, res.body);
        }
        dogstatsd.timing('api.krain.request',
          new Date()-start,
          ['statusCode:'+res.statusCode, 'didErr:'+(err!==null), 'method:POST', 'call:postStream']);
      });
    stream.pipe(r);
  },
  del: function (container, path, cb) {
    var start = new Date();
    request(
      createRequeset('DELETE', container, path),
      function (err, res) {
        if (err) {
          cb(err);
        } else if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(badRes(res));
        } else {
          cb(null);
        }
        dogstatsd.timing('api.krain.request',
          new Date()-start,
          ['statusCode:'+res.statusCode, 'didErr:'+(err!==null), 'method:DELETE', 'call:del']);
      });
  }
};
