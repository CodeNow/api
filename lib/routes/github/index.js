'use strict';

var express = require('express');
var app = module.exports = express();
var jsonHash = require('json-hash');
var httpProxy = require('http-proxy');
var concat = require('concat-stream');
var http = require('http');
var omit = require('101/omit');
var mw = require('dat-middleware');
var passport = require('middlewares/passport');
var validations = require('middlewares/validations');
var equals = validations.equals;
var qs = require('querystring');
var redis = require('models/redis');
var Boom = require('dat-middleware').Boom;
var dogstatsd = require('models/datadog');
var debug = require('debug')('runnable-api:routes:github');
var error = require('error');
var url = require('url');
var path = require('path');
var corsHeaders = [
  // these access-control-* are for cors
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age'
];
var cacheOmitHeaders = [
  'date',
  'x-ratelimit-reset',
  'x-served-by',
].concat(corsHeaders);
var setHeaders = function (res, headers) {
  Object.keys(headers).forEach(function(key) {
    res.set(key, headers[key]);
  });
};

var proxy = httpProxy.createProxy({
  target: 'https://api.github.com',
  holdResponse: true
});

proxy.on('error', error.log.bind(error));

proxy.on('proxyRes', handleGithubRes);

app.all('/github/*',
  require('middlewares/session'),
  passport.initialize({ userProperty: 'sessionUser' }),
  passport.session(),
  require('middlewares/cors'),
  mw.req('method').validate(equals('GET'))
    .then(
      mw.req('sessionUser.accounts.github.accessToken').require()
        .else(
          mw.next(Boom.forbidden('Only authenticated Runnable users can access this endpoint.'))),
      countCacheDatadog,
      generateKey,
      getCachedData,
      proxyRequest)
    .else(
      mw.res.send(501)));

function countCacheDatadog (req, res, next) {
  dogstatsd.increment('api.cache.github.count');
  next();
}

function generateKey (req, res, next) {
  var token = req.sessionUser.accounts.github.accessToken;

  var urlSplit = req.url.split('?');
  // remove '/github' from url
  var path  = urlSplit[0].replace(/^\/github/, '');
  var query = qs.parse(urlSplit[1]); // null/undefined -> {}
  query.access_token = token;
  // req.url is used by proxy..
  req.url = path + '?' + qs.stringify(query);

  req.cacheRedisKey = ['github-proxy-cache', req.method, path, jsonHash.digest(query)].join(':');
  next();
}

function getCachedData (req, res, next) {
  // using buffer key makes redis return all keys with buffer values.
  var bufferKey = new Buffer(req.cacheRedisKey);
  redis.hgetall(bufferKey, function (err, cachedData) {
    if (err) { return next(err); }
    req.cachedData = cachedData;
    next();
  });
}

function proxyRequest (req) {
  var noopRes = new http.ServerResponse({});
  debug('proxying with headers', req.headers);
  // we dont care about browser's cache-control - always hit github.
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  if (req.cachedData) {
    var etag = req.cachedData.etag.toString(); // was buffer
    if (req.headers['cache-control'] !== 'no-cache') {
      debug('adding etag', etag);
      req.headers['if-none-match'] = etag;
    }
  }
  // github wants these headers
  req.headers.host   = 'api.github.com:443';
  req.headers.accept = 'application/vnd.github.v3+json';
  // proxy res to noop... we handle github's response in handleGithubRes
  proxy.proxyRequest(req, noopRes);
}

/* Proxy Methods */

function handleGithubRes (proxyRes, req) {
  var res = req.res;
  // prevent express from calling this a 'fresh' request and 304-ing it anyway
  delete req.headers['if-none-match'];
  if (proxyRes.headers.link) {
    proxyRes.headers.link = fixGithubLinkRefs(proxyRes.headers.link);
  }
  if (req.cachedData && proxyRes.statusCode === 304) {
    sendCached(req, proxyRes, res);
  } else if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
    pipeSuccessfulRes(req, proxyRes, res);
  } else {
    pipeErrorRes(proxyRes, res);
  }
}

function fixGithubLinkRefs (links) {
  var runnableParsedUrl = url.parse(process.env.FULL_API_DOMAIN);
  // split on the commas, so no weird looping with regex
  links = links.split(', ');
  var newLinks = [];
  var linkRegexp = /<([^>]+)>; rel\=\"\w+\"/;
  links.forEach(function (linkRef) {
    var matches = linkRegexp.exec(linkRef);
    if (matches && matches[1]) {
      // we have a match, parse and parse query string
      var parsedUrl = url.parse(matches[1], true);
      parsedUrl.protocol = runnableParsedUrl.protocol;
      parsedUrl.host = runnableParsedUrl.host;
      parsedUrl.path = path.join('github', parsedUrl.path);
      parsedUrl.pathname = path.join('/github', parsedUrl.pathname);
      if (parsedUrl.query.access_token) {
        // we don't want to pass the access_token back
        delete parsedUrl.query.access_token;
      }
      linkRef = linkRef.replace(matches[1], parsedUrl.format());
    }
    newLinks.push(linkRef);
  });
  return newLinks.join(', ');
}

function sendCached (req, proxyRes, res) {
  dogstatsd.increment('api.cache.github.hit');
  debug('cache hit!', 'statusCode:', proxyRes.statusCode, 'etag:', proxyRes.headers.etag);
  var cacheHeaders = JSON.parse(req.cachedData.headers);
  setHeaders(res, omit(proxyRes.headers, corsHeaders));
  setHeaders(res, omit(cacheHeaders, cacheOmitHeaders));
  res.status(req.cachedData.statusCode.toString()); // was buffer
  res.send(req.cachedData.body);
}

function pipeSuccessfulRes (req, proxyRes, res) {
  dogstatsd.increment('api.cache.github.miss');
  debug('cache miss!', 'statusCode:', proxyRes.statusCode, 'etag:', proxyRes.headers.etag);
  res.status(proxyRes.statusCode);
  // we want all the proxyRes headers, except the cors related stuff
  setHeaders(res, omit(proxyRes.headers, corsHeaders));
  proxyRes.pipe(concat(toCache));
  res.status(proxyRes.statusCode);
  proxyRes.pipe(res);
  function toCache (body) {
    var redisKey = req.cacheRedisKey;
    redis.hmset(redisKey,
      'statusCode', proxyRes.statusCode,
      'etag', proxyRes.headers.etag,
      'headers', JSON.stringify(proxyRes.headers),
      'body', body,
    function (err) {
      if (err) { error.log(err); }
      else { redis.expire(redisKey, process.env.GITHUB_PROXY_EXPIRATION); }
    });
  }
}

function pipeErrorRes (proxyRes, res) {
  dogstatsd.increment('api.cache.github.error_miss');
  debug('cache miss (error)!', 'statusCode:', proxyRes.statusCode, 'etag:', proxyRes.headers.etag);
  setHeaders(res, omit(proxyRes.headers, corsHeaders));
  proxyRes.pipe(res);
}
