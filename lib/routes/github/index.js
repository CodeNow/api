/**
 * @module lib/routes/github/index
 */
'use strict'
var Boom = require('dat-middleware').Boom
var concat = require('concat-stream')
var express = require('express')
var httpProxy = require('http-proxy')
var jsonHash = require('json-hash')
var monitorDog = require('monitor-dog')
var mw = require('dat-middleware')
var omit = require('101/omit')
var path = require('path')
var qs = require('querystring')
var url = require('url')
var xtend = require('xtend')

var error = require('error')
var logger = require('logger')
var passport = require('middlewares/passport')
var redis = require('models/redis')
var validations = require('middlewares/validations')

var app = module.exports = express()
var equalsAny = validations.equalsAny
var corsHeaders = [
  // these access-control-* are for cors
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
  'strict-transport-security'
]
var githubAcceptPreviewHeader = 'application/vnd.github.ironman-preview+json'
var cacheOmitHeaders = [
  'date',
  'x-ratelimit-reset',
  'x-served-by'
].concat(corsHeaders)

var proxy = httpProxy.createProxy({
  target: 'https://api.github.com',
  // github wants these headers
  headers: {
    host: 'api.github.com',
    accept: 'application/vnd.github.v3+json'
  }
})

proxy.on('error', error.log.bind(error))

proxy.on('proxyReq', function (proxyReq, req) {
  // we dont care about browser's cache-control - always hit github.
  // cleanup all headers before sending them to github
  Object.keys(req.headers).forEach(function (key) {
    if (key !== 'user-agent' && key !== 'accept' && key !== 'host') {
      delete req.headers[key]
      proxyReq.removeHeader(key)
    }
  })
  if (req.cachedData && req.headers['cache-control'] !== 'no-cache') {
    // Clean up etags because github will make them W/ which means they are WEAK.
    // Also we want to cleanup quotes and slashes
    // etag are received in the following format: W/"22e8fcac0a8d2a7220fc9f94ac46923d"
    // when we send etag back to github it's fine to send it like "22e8fcac0a8d2a7220fc9f94ac46923d"
    var etag = req.cachedData.etag.toString() // was buffer
    etag = etag.replace('W/', '').replace(/"/g, '').replace(/\\/g, '')
    // etag should be sent in quotes always
    var quotedEtag = '"' + etag + '"'
    logger.trace({ etag: quotedEtag }, 'proxyReq')
    proxyReq.setHeader('if-none-match', quotedEtag)
  }
  if (req.headers['accept'] && req.headers['accept'] === githubAcceptPreviewHeader) {
    proxyReq.setHeader('accept', req.headers['accept'])
  }
  logger.trace({
    reqHeaders: req.headers.length,
    proxyHeaders: proxyReq._headers.length
  }, 'on proxy github request')
})

proxy.on('proxyRes', handleGithubRes)

// let's stop this route from puting it's own etags
app.disable('etag')
app.all('/github/*',
  require('middlewares/session'),
  passport.initialize({ userProperty: 'sessionUser' }),
  passport.session(),
  require('middlewares/cors'),
  mw.req('method').validate(equalsAny(['GET', 'PUT']))
    .then(
      mw.req('sessionUser.accounts.github.accessToken').require()
        .else(
          mw.next(Boom.forbidden('Only authenticated Runnable users can access this endpoint.'))),
      countCacheDatadog,
      generateKey,
      getCachedData,
      proxyRequest)
    .else(
      mw.res.send(501)))

function countCacheDatadog (req, res, next) {
  monitorDog.increment('api.cache.github.count')
  next()
}

function generateKey (req, res, next) {
  var token = req.sessionUser.accounts.github.accessToken

  var urlSplit = req.url.split('?')
  // remove '/github' from url
  var path = urlSplit[0].replace(/^\/github/, '')
  var query = qs.parse(urlSplit[1]) // null/undefined -> {}
  query.access_token = token
  // req.url is used by proxy..
  req.url = path + '?' + qs.stringify(query)

  req.cacheRedisKey = ['github-proxy-cache', req.method, path, jsonHash.digest(query)].join(':')
  next()
}

function getCachedData (req, res, next) {
  // using buffer key makes redis return all keys with buffer values.
  var bufferKey = new Buffer(req.cacheRedisKey)
  redis.hgetall(bufferKey, function (err, cachedData) {
    if (err) { return next(err) }
    req.cachedData = cachedData
    next()
  })
}

function proxyRequest (req, res) {
  logger.trace('proxying the request')
  proxy.proxyRequest(req, res)
}

/* Proxy Methods for handing the github response */

function handleGithubRes (proxyRes, req, res) {
  // prevent express from calling this a 'fresh' request and 304-ing it anyway
  delete req.headers['if-none-match']
  if (proxyRes.headers.link) {
    proxyRes.headers.link = fixGithubLinkRefs(proxyRes.headers.link)
  }
  if (req.cachedData && proxyRes.statusCode === 304) {
    handleGithubCacheOkayRes(req, proxyRes)
  } else if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
    handleGithubCacheMissRes(req, proxyRes)
  } else {
    handleGithubErrRes(proxyRes, res)
  }
}

function fixGithubLinkRefs (links) {
  var runnableParsedUrl = url.parse(process.env.FULL_API_DOMAIN)
  // split on the commas, so no weird looping with regex
  links = links.split(', ')
  var newLinks = []
  var linkRegexp = /<([^>]+)> rel\=\"\w+\"/
  links.forEach(function (linkRef) {
    var matches = linkRegexp.exec(linkRef)
    if (matches && matches[1]) {
      // we have a match, parse and parse query string
      var parsedUrl = url.parse(matches[1], true)
      parsedUrl.protocol = runnableParsedUrl.protocol
      parsedUrl.host = runnableParsedUrl.host
      parsedUrl.path = path.join('github', parsedUrl.path)
      parsedUrl.pathname = path.join('/github', parsedUrl.pathname)
      if (parsedUrl.query.access_token) {
        // we don't want to pass the access_token back
        delete parsedUrl.query.access_token
      }
      linkRef = linkRef.replace(matches[1], parsedUrl.format())
    }
    newLinks.push(linkRef)
  })
  return newLinks.join(', ')
}

function handleGithubCacheOkayRes (req, proxyRes) {
  monitorDog.increment('api.cache.github.hit')
  logger.trace({
    statusCode: proxyRes.statusCode,
    etag: proxyRes.headers.etag
  }, 'cache hit')
  var cacheHeaders = JSON.parse(req.cachedData.headers)
  cacheHeaders = omit(cacheHeaders, cacheOmitHeaders)
  proxyRes.headers = xtend(proxyRes.headers, cacheHeaders)
  proxyRes.headers = omit(proxyRes.headers, corsHeaders)
  proxyRes.statusCode = 1 * req.cachedData.statusCode.toString() // was buffer
  var cachedData = req.cachedData.body
  proxyRes.__pipe = proxyRes.pipe
  proxyRes.pipe = function (dest) {
    dest.write(cachedData)
    dest.end()
    this.pipe = this.__pipe
  }
}

function handleGithubCacheMissRes (req, proxyRes) {
  monitorDog.increment('api.cache.github.miss')
  logger.trace({
    statusCode: proxyRes.statusCode,
    etag: proxyRes.headers.etag
  }, 'cache miss')
  // we want all the proxyRes headers, except the cors related stuff
  proxyRes.headers = omit(proxyRes.headers, corsHeaders)
  // overwrite .pipe() so we can pipe it twice
  proxyRes.__pipe = proxyRes.pipe
  proxyRes.pipe = function (dest) {
    this.__pipe(concat(toCache))
    this.__pipe(dest)
    this.pipe = this.__pipe
  }
  function toCache (body) {
    var redisKey = req.cacheRedisKey
    var etag = proxyRes.headers.etag
    redis.hmset(redisKey,
      'statusCode', proxyRes.statusCode,
      'etag', etag,
      'headers', JSON.stringify(proxyRes.headers),
      'body', body,
      'date', Date.now(),
      function (err) {
        if (err) { error.log(err, req) } else { redis.expire(redisKey, process.env.GITHUB_PROXY_EXPIRATION) }
      })
  }
}

function handleGithubErrRes (proxyRes) {
  monitorDog.increment('api.cache.github.error_miss')
  logger.trace({
    statusCode: proxyRes.statusCode
  }, 'handleGithubErrRes')
  proxyRes.headers = omit(proxyRes.headers, corsHeaders)
}
