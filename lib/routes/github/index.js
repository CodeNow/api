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

var proxy = httpProxy.createProxy({
  target: 'https://api.github.com',
  holdResponse: true
});

proxy.on('proxyRes', function (proxyRes, req) {
  var res = req.res;
  var hash = new redisTypes.Hash(req.hashKey);
  if (proxyRes.statusCode === 304) {
    hash.getall(function (err, resData) {
      if (err) {
        res.json(500, 'we done fucked up');
      } else {
        jsonObjectify([
          resData.statusCode,
          resData.headers,
          resData.body
        ], function (err, cachedData) {
          if (err) {
            hash.del();
            res.json(500, 'bad cache data. try request again.');
          } else {
            var statusCode = cachedData[0];
            var headers = cachedData[1];
            var body = cachedData[2];
            writeHeaders(headers, res);
            res.status(statusCode).json(body);
          }
        });
      }
    });
  } else {
    var saveToRedis = concat(function (body) {
      var headers = omit(proxyRes.headers, cacheOmitHeaders);
      async.waterfall([
        jsonStringify.bind(null, headers),
        function (headersStr, cb) {
          hash.mset(
            'statusCode', proxyRes.statusCode,
            'body', body,
            'headers', headersStr,
            'etag', headers.etag,
          cb);
        }
      ], error.logIfErr);
    });
    writeHeaders(proxyRes.headers, res);
    proxyRes.pipe(saveToRedis);
    proxyRes.pipe(res);
  }
});

app.all('*',
  require('middlewares/session'),
  passport.initialize({ userProperty: 'sessionUser' }),
  passport.session(),
  mw.query().set('access_token', 'sessionUser.accounts.github.access_token'),
  mw.req('method').validate(equals('GET'))
    .then(
      bodyParser.json(),
      getETagFromRedis,
      proxyRequest)
    .else(
      proxyRequest));

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
  if (req.useETag) {
    req.headers['If-None-Match'] = req.useETag;
    res = new http.ServerResponse({});
  }
  proxy.proxyRequest(req, res);
}

function hashKey (req) {
  return [
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
  'x-served-by'
];

function writeHeaders(headers, res) {
  Object.keys(headers).forEach(function(key) {
    res.setHeader(key, headers[key]);
  });
}
