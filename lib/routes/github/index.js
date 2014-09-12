'use strict';

var express = require('express');
var app = module.exports = express();
var jsonHash = require('json-hash');
var httpProxy = require('http-proxy');
var bodyParser = require('body-parser');
var redisTypes = require('redis-types');
var concat = require('concat-stream');
var http = require('http');
var async = require('async');
var error = require('error');
var omit = require('101/omit');
var mw = require('dat-middleware');
var passport = require('middlewares/passport');
var validations = require('middlewares/validations');
var equals = validations.equals;
var debug = require('debug')('runnable-api:routes:github');
var qs = require('querystring');
var xtend = require('xtend');
var zlib = require('zlib');

var dogstatsd = require('models/datadog');

var proxy = httpProxy.createProxy({
  target: 'https://api.github.com',
  holdResponse: true
});

proxy.on('proxyRes', function (proxyRes, req) {
  var res = req.res;
  var hash = new redisTypes.Hash(req.hashKey);
  if (proxyRes.statusCode === 304) { // Cache HIT
    dogstatsd.increment('api.cache.github.hit');
    debug('cache hit');
    hash.getall(function (err, resData) {
      if (err) {
        error.errorHandler(err, req, res);
      } else {
        jsonObjectify([
          resData.statusCode,
          resData.headers,
          resData.body
        ], function (err, cachedData) {
          if (err) {
            hash.del(error.logIfErr);
            error.errorHandler(err, req, res);
          } else {
            var statusCode = cachedData[0];
            var headers = cachedData[1];
            var body = cachedData[2];
            writeHeaders(headers, res);
            res.status(statusCode);
            res.json(body);
          }
        });
      }
    });
  } else if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
    // Cache MISS with a valid status code
    dogstatsd.increment('api.cache.github.miss');
    debug('cache miss', proxyRes.statusCode);
    var saveToRedis = concat(function (body) {
      var headers = omit(proxyRes.headers, cacheOmitHeaders);
      async.waterfall([
        jsonStringify.bind(null, headers),
        function (hs, cb) {
          if (proxyRes.headers['content-encoding'] === 'gzip') {
            zlib.gunzip(body, function (err, body) {
              cb(err, hs, body);
            });
          } else {
            cb(null, hs, body);
          }
        },
        function (hs, body, cb) {
          jsonParsify(body, function (err, newBody) {
            cb(err, hs, body, newBody);
          });
        },
        function (headersStr, bodyBuffer, bodyObject, cb) {
          hash.mset(
            'statusCode', proxyRes.statusCode,
            'body', bodyBuffer,
            'headers', headersStr,
            'etag', headers.etag,
          function (err) {
            cb(err, bodyObject);
          });
        },
        function (bodyObject, cb) {
          res.json(bodyObject);
          cb();
        }
      ], error.logIfErr);
    });

    writeHeaders(proxyRes.headers, res);
    res.status(proxyRes.statusCode);
    proxyRes.pipe(saveToRedis);
  } else {
    // some other error - just pipe it through
    dogstatsd.increment('api.cache.github.error_miss');
    debug('cache miss', proxyRes.statusCode);
    proxyRes.pipe(res);
  }
});

app.all('*',
  require('middlewares/session'),
  passport.initialize({ userProperty: 'sessionUser' }),
  passport.session(),
  require('middlewares/cors'),
  mw.req('method').validate(equals('GET'))
    .then(
      countCacheDatadog,
      bodyParser.json(),
      getETagFromRedis,
      proxyRequest)
    .else(
      mw.res.send(501)));

function countCacheDatadog (req, res, next) {
  dogstatsd.increment('api.cache.github.count');
  next();
}

function getETagFromRedis (req, res, next) {
  req.hashKey = hashKey(req);
  var hash = new redisTypes.Hash(req.hashKey);
  hash.get('etag', function (err, etag) {
    if (err) {
      next(err);
    } else if (etag) {
      req.useETag = etag;
      next(null);
    } else {
      next(null);
    }
  });
}

function proxyRequest (req, res) {
  req.headers.host = 'api.github.com:443';
  req.headers.accept = 'application/vnd.github.v3+json';
  if (req.useETag) {
    req.headers['If-None-Match'] = req.useETag;
  }
  res = new http.ServerResponse({});
  var urlSplit = req.url.split('?');
  var url = urlSplit[0];
  var query = xtend(qs.parse(urlSplit[1]), {
    access_token: req.sessionUser.accounts.github.accessToken
  });
  req.url = url + '?' + qs.stringify(query);
  proxy.proxyRequest(req, res);
}

function hashKey (req) {
  return [
    'github-proxy:',
    req.method,
    req.url,
    jsonHash.digest(req.query || {})
  ].join('');
}


var jsonStringify = function (headers, cb) {
  try {
    headers = JSON.stringify(headers);
    cb(null, headers);
  } catch (e) {
    cb(e);
  }
};

var jsonParsify = function (data, cb) {
  try {
    data = JSON.parse(data.write ? data.toString() : data);
    cb(null, data);
  } catch (e) {
    cb(e);
  }
};

var jsonObjectify = function (jsonObjects, cb) {
  if (!Array.isArray(jsonObjects)) { jsonObjects = [jsonObjects]; }
  var resObjects = [];
  try {
    jsonObjects.forEach(function (o) {
      resObjects.push(JSON.parse(o));
    });
    cb(null, resObjects);
  } catch (e) {
    cb(e);
  }
};

var cacheOmitHeaders = [
  'date',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-github-request-id',
  'x-served-by',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
  'content-encoding'
];

function writeHeaders(headers, res) {
  Object.keys(headers).forEach(function(key) {
    if (~cacheOmitHeaders.indexOf(key)) { return; }
    res.setHeader(key, headers[key]);
  });
}
