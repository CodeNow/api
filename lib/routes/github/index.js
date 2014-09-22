'use strict';

var express = require('express');
var app = module.exports = express();
var jsonHash = require('json-hash');
var httpProxy = require('http-proxy');
var bodyParser = require('body-parser');
var concat = require('concat-stream');
var http = require('http');
var omit = require('101/omit');
var mw = require('dat-middleware');
var passport = require('middlewares/passport');
var validations = require('middlewares/validations');
var equals = validations.equals;
var qs = require('querystring');
var xtend = require('xtend');
var keypather = require('keypather')();
var redis = require('models/redis');
var Boom = require('dat-middleware').Boom;
var dogstatsd = require('models/datadog');
var debug = require('debug')('runnable-api:routes:github');

var proxy = httpProxy.createProxy({
  target: 'https://api.github.com',
  holdResponse: true
});

proxy.on('proxyRes', function (proxyRes, req) {
  var res = req.res;
  // prevent express from calling this a 'fresh' request and 304-ing it anyway
  delete req.headers['if-none-match'];
  if (proxyRes.statusCode === 304) {
    dogstatsd.increment('api.cache.github.hit');
    debug('cache hit');
    proxyRes.headers = xtend(proxyRes.headers,
      omit(JSON.parse(req.cachedData.headers), cacheOmitHeaders));
    writeHeaders(proxyRes.headers, res);
    res.status(req.cachedData.statusCode);
    res.send(req.cachedData.body);
  } else if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
    dogstatsd.increment('api.cache.github.miss');
    debug('cache miss', proxyRes.statusCode);
    var redisKey = req.redisDigest;
    res.status(proxyRes.statusCode);
    writeHeaders(proxyRes.headers, res);
    proxyRes.pipe(concat(function (body) {
      redis.hmset(redisKey,
        'statusCode', proxyRes.statusCode,
        'etag', proxyRes.headers.etag,
        'headers', JSON.stringify(proxyRes.headers),
        'body', body,
      function (err) {
        if (!err) { redis.expire(redisKey, process.env.GITHUB_PROXY_EXPIRATION); }
      });
    }));
    proxyRes.pipe(res);
  } else {
    dogstatsd.increment('api.cache.github.error_miss');
    debug('cache miss', proxyRes.statusCode);
    writeHeaders(proxyRes.headers, res);
    proxyRes.pipe(res);
  }
});

app.all('/github/*',
  require('middlewares/session'),
  passport.initialize({ userProperty: 'sessionUser' }),
  passport.session(),
  require('middlewares/cors'),
  mw.req('method').validate(equals('GET'))
    .then(
      countCacheDatadog,
      bodyParser.json(),
      prepRequest,
      getETagFromRedis,
      proxyRequest)
    .else(
      mw.res.send(501)));

function countCacheDatadog (req, res, next) {
  dogstatsd.increment('api.cache.github.count');
  next();
}

function prepRequest (req, res, next) {
  var token = keypather.get(req, 'sessionUser.accounts.github.accessToken');
  if (!token) {
    return next(Boom.forbidden('Only authenticated Runnable users can access this endpoint.'));
  }
  var urlSplit = req.url.split('?');
  var url = urlSplit[0];
  var query = qs.parse(urlSplit[1]);
  if (token) {
    xtend(query, {
     access_token: token
    });
  }
  url = url.replace(/^\/github/, '');
  req.url = url + '?' + qs.stringify(query);
  req.headers.host = 'api.github.com:443';
  req.headers.accept = 'application/vnd.github.v3+json';
  req.redisDigest = 'github-proxy-cache:' + jsonHash.digest({
    headers: req.headers,
    url: req.url
  });
  next();
}

function getETagFromRedis (req, res, next) {
  redis.hgetall(new Buffer(req.redisDigest), function (err, data) {
    if (err) { next(err); }
    else {
      req.cachedData = data;
      next(null);
    }
  });
}

function proxyRequest (req, res) {
  res = new http.ServerResponse({});
  proxy.proxyRequest(req, res);
}

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
  'access-control-max-age'
];

function writeHeaders(headers, res) {
  Object.keys(headers).forEach(function(key) {
    if (~cacheOmitHeaders.indexOf(key)) { return; }
    res.setHeader(key, headers[key]);
  });
}
