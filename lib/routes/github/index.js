/**
 * @module lib/routes/github/index
 */
'use strict'

var express = require('express')
var app = module.exports = express()

var Boom = require('dat-middleware').Boom
var concat = require('concat-stream')
var error = require('error')
var httpProxy = require('http-proxy')
var jsonHash = require('json-hash')
var mw = require('dat-middleware')
var omit = require('101/omit')
var path = require('path')
var qs = require('querystring')
var url = require('url')
var xtend = require('xtend')
var pick = require('101/pick')

var dogstatsd = require('models/datadog')
var logger = require('middlewares/logger')(__filename)
var passport = require('middlewares/passport')
var redis = require('models/redis')
var validations = require('middlewares/validations')

var log = logger.log
var equals = validations.equals
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
  xfwd: true,
  // github wants these headers
  headers: {
    host: 'api.github.com:443',
    // accept: 'application/vnd.github.v3+json'
  }
})

proxy.on('error', error.log.bind(error))

proxy.on('proxyReq', function (proxyReq, req) {
  // we dont care about browser's cache-control - always hit github.
  delete req.headers['if-none-match']
  delete req.headers['if-modified-since']
  delete req.headers['cookie']
  // Object.keys(req.headers).forEach(function (key) {
  //   if(key !== 'user-agent') {
  //     delete req.headers[key]
  //     proxyReq.setHeader(key, '')
  //   }
  // })

  if (req.cachedData && req.headers['cache-control'] !== 'no-cache') {
    var etag = req.cachedData.etag.toString() // was buffer
    if (etag) {
      etag = etag.replace(/"/g,'').replace(/\\/g,'')
      log.trace({
        etag: etag
      }, 'cleanuped up etag')
      console.log('xxxxxxxx', etag)
    }
    log.trace({
      tx: true,
      etag: etag
    }, 'proxyReq')
    proxyReq.setHeader('If-None-Match', etag)
  }
  if (req.headers['accept'] && req.headers['accept'] === githubAcceptPreviewHeader) {
    // proxyReq.setHeader('accept', req.headers['accept'])
  }
  log.trace({
    origReqHeaders: JSON.stringify(req.headers, true, 2),
    origProxyHeaders: JSON.stringify(proxyReq.headers, true, 2),
    orig_proxyHeaders: JSON.stringify(proxyReq._headers, true, 2)
  }, 'original on proxy github request')
  req.headers = pick(req.headers, ['user-agent', 'if-none-match', 'origin'])
  log.trace({
    reqHeaders: JSON.stringify(req.headers, true, 2),
    proxyHeaders: JSON.stringify(proxyReq.headers, true, 2),
    _proxyHeaders: JSON.stringify(proxyReq._headers, true, 2)
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
      mw.res.send(501)))

function countCacheDatadog (req, res, next) {
  dogstatsd.increment('api.cache.github.count')
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
  log.trace({
    tx: true
  }, 'proxying the request')
  proxy.proxyRequest(req, res)
}

/* Proxy Methods for handing the github response */

function handleGithubRes (proxyRes, req, res) {
  log.trace({
    headers: JSON.stringify(proxyRes.headers, true, 2)
  }, 'on proxy github response')
  // prevent express from calling this a 'fresh' request and 304-ing it anyway
  delete req.headers['if-none-match']
  if (proxyRes.headers.link) {
    proxyRes.headers.link = fixGithubLinkRefs(proxyRes.headers.link)
  }
  var oldETag = proxyRes.headers.etag
  // Clean up etag's because github will make them W/ which means they are WEAK.
  if (proxyRes.headers.etag) {
    proxyRes.headers.etag = proxyRes.headers.etag.replace('W/','').replace(/"/g,'').replace(/\\/g,'')
  }
  log.trace({
    cachedDataExists: !!req.cachedData,
    statusCode: proxyRes.statusCode,
    cacheRedisKey: req.cacheRedisKey,
    etag: oldETag,
    newEtag: proxyRes.headers.etag
  }, 'FINDME - Github Cache Status')
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
  dogstatsd.increment('api.cache.github.hit')
  log.trace({
    tx: true,
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
  dogstatsd.increment('api.cache.github.miss')
  log.trace({
    tx: true,
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
    var etag = proxyRes.headers.etag.replace('W/','').replace(/"/g,'').replace(/\\/g,'')
    redis.hmset(redisKey,
      'statusCode', proxyRes.statusCode,
      'etag', etag,
      'headers', JSON.stringify(proxyRes.headers),
      'body', body,
      function (err) {
        if (err) { error.log(err, req) } else { redis.expire(redisKey, process.env.GITHUB_PROXY_EXPIRATION) }
      })
  }
}

function handleGithubErrRes (proxyRes) {
  dogstatsd.increment('api.cache.github.error_miss')
  log.trace({
    tx: true,
    statusCode: proxyRes.statusCode
  }, 'handleGithubErrRes')
  proxyRes.headers = omit(proxyRes.headers, corsHeaders)
}
