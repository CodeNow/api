/**
 * GitHub API request wrapper methods
 * @module lib/models/apis/github
 */
'use strict'

var Boom = require('dat-middleware').Boom
var GithubApi = require('github')
var async = require('async')
var aws = require('aws-sdk')
var crypto = require('crypto')
var defaults = require('defaults')
var find = require('101/find')
var hasKeypaths = require('101/has-keypaths')
var hasProps = require('101/has-properties')
var keypather = require('keypather')()
var redisTypes = require('redis-types')
var util = require('util')

var Keypair = require('models/mongo/keypair')
var logger = require('middlewares/logger')(__filename)

module.exports = Github

var cacheQueue = {}
var keyPrefix = process.env.REDIS_NAMESPACE + 'github-model-cache:'
var s3 = new aws.S3()

function parseCacheControl (str) {
  if (!str) { return {} }
  var params = str.split(',').map(function (v) { return v.trim() })
  var ret = {}
  params.forEach(function (v) {
    if (/.+=.+/.test(v)) {
      var s = v.split('=')
      ret[s[0]] = s[1]
    } else {
      ret[v] = true
    }
  })
  return ret
}

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: '3.0.0',
    // optional
    debug: false, // envIs('development', 'test'),
    protocol: 'https',
    requestMedia: 'application/json'
  })
  GithubApi.call(this, opts)
  if (opts.token) {
    this.token = opts.token
    var md5sum = crypto.createHash('md5')
    md5sum.update(opts.token)
    this.tokenHash = md5sum.digest('hex')
    this.authenticate({
      type: 'oauth',
      token: opts.token
    })
  } else {
    this.authenticate({
      type: 'oauth',
      key: process.env.GITHUB_CLIENT_ID,
      secret: process.env.GITHUB_CLIENT_SECRET
    })
  }
}

util.inherits(Github, GithubApi)

Github.prototype.getRepo = function (repo, cb) {
  logger.log.info({
    tx: true,
    repo: repo
  }, 'Github.prototype.getRepo')
  var split = repo.split('/')
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var usernameKey = new redisTypes.String(userKey + ':getRepo:' + repo)
  this._runQueryAgainstCache({
    query: this.repos.get,
    debug: 'this.repos.get',
    opts: {
      user: split[0],
      repo: split[1]
    },
    stringKey: usernameKey
  }, cb)
}

Github.prototype.isPublicRepo = function (repo, cb) {
  logger.log.info({
    tx: true,
    repo: repo
  }, 'Github.prototype.isPublicRepo')
  this.getRepo(repo, function (err, data) {
    if (err) { return cb(err) }
    if (!data) {
      return cb(Boom.notFound('Github repo ' + repo + ' not found.'))
    }
    cb(null, !data['private'])
  })
}

Github.prototype.getRepoContent = function (repo, fullPath, cb) {
  logger.log.info({
    tx: true,
    repo: repo,
    fullPath: fullPath
  }, 'Github.prototype.getRepoContent')
  var split = repo.split('/')
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var usernameKey = new redisTypes.String(userKey + ':getRepo:' + repo + ':content:' + fullPath)
  this._runQueryAgainstCache({
    query: this.repos.getContent,
    debug: 'this.repos.getContent',
    opts: {
      user: split[0],
      repo: split[1],
      path: fullPath
    },
    stringKey: usernameKey
  }, cb)
}

Github.prototype.getDeployKeys = function (repo, cb) {
  logger.log.info({
    tx: true,
    repo: repo
  }, 'Github.prototype.getDeployKeys')
  var split = repo.split('/')
  this.repos.getKeys({
    user: split[0],
    repo: split[1],
    per_page: 100
  }, cb)
}

Github.prototype.getCommit = function (repo, commit, cb) {
  logger.log.info({
    tx: true,
    repo: repo,
    commit: commit
  }, 'Github.prototype.getCommit')
  var splitRepo = repo.split('/')
  var ownername = splitRepo[0]
  var reponame = splitRepo[1]
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var usernameKey = new redisTypes.String(userKey + ':repo:' + repo + ':commit:' + commit)
  this._runQueryAgainstCache({
    query: this.repos.getCommit,
    debug: 'this.repos.getCommit',
    opts: { user: ownername, repo: reponame, sha: commit },
    stringKey: usernameKey
  }, cb)
}

Github.prototype.getBranch = function (repo, branch, cb) {
  logger.log.info({
    tx: true,
    repo: repo,
    branch: branch
  }, 'Github.prototype.getBranch')
  var splitRepo = repo.split('/')
  var ownername = splitRepo[0]
  var reponame = splitRepo[1]
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var usernameKey = new redisTypes.String(userKey + ':repo:' + repo + ':branch:' + branch)
  this._runQueryAgainstCache({
    query: this.repos.getBranch,
    debug: 'this.repos.getBranch',
    opts: { user: ownername, repo: reponame, branch: branch },
    stringKey: usernameKey
  }, cb)
}

Github.prototype.getAuthorizedUser = function (cb) {
  logger.log.info({
    tx: true
  }, 'Github.prototype.getAuthorizedUser')
  if (!this.token) {
    return cb(Boom.badImplementation('getAuthorizedUser should only be called with a user token'))
  }
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var usernameKey = new redisTypes.String(userKey + ':get:self')
  this._runQueryAgainstCache({
    query: this.user.get,
    debug: 'this.user.get',
    stringKey: usernameKey
  }, cb)
}

Github.prototype.getUserByUsername = function (username, cb) {
  logger.log.info({
    tx: true,
    username: username
  }, 'Github.prototype.getUserByUsername')
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var usernameKey = new redisTypes.String(userKey + ':getByUsername:' + username)
  this._runQueryAgainstCache({
    query: this.user.getFrom,
    debug: 'this.user.getFrom',
    opts: { user: username },
    stringKey: usernameKey
  }, cb)
}

Github.prototype.getUserById = function (githubId, cb) {
  logger.log.info({
    tx: true,
    githubId: githubId
  }, 'Github.prototype.getUserById')
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var userIdKey = new redisTypes.String(userKey + ':getUserById:' + githubId)
  this._runQueryAgainstCache({
    query: this.user.getById,
    debug: 'this.user.getById',
    opts: { id: githubId },
    stringKey: userIdKey
  }, cb)
}

Github.prototype.getUserAuthorizedOrgs = function (cb) {
  logger.log.info({
    tx: true
  }, 'Github.prototype.getUserAuthorizedOrgs')
  if (!this.token) {
    var errorMsg = 'getUserAuthorizedOrgs should only be called with a user token'
    return cb(Boom.badImplementation(errorMsg))
  }
  var userKey = keyPrefix + (this.token ? this.tokenHash : 'runnable')
  var userOrgsKey = new redisTypes.String(userKey + ':user:' + this.token + ':orgs')
  this._runQueryAgainstCache({
    query: this.user.getOrgs,
    debug: 'this.user.getOrgs',
    stringKey: userOrgsKey
  }, cb)
}

// I assume one would only ever not pass `opts`.
Github.prototype._runQueryAgainstCache = function (options, cb) {
  logger.log.info({
    tx: true,
    options: options
  }, 'Github.prototype._runQueryAgainstCache')
  var self = this
  var query = options.query
  var stringKey = options.stringKey || undefined
  var opts = options.opts || {}

  async.waterfall([
    fetchCachedQueryDataAndMakeDecision,
    checkDataAndRunAnyRequest
  ], function (err, data) {
    if (err) { return cb(err) }
    cb(err, data.data, data.meta)
  })

  function fetchCachedQueryDataAndMakeDecision (cb) {
    logger.log.trace({
      tx: true
    }, 'Github.prototype._runQueryAgainstCache fetchCachedQueryDataAndMakeDecision')

    stringKey.get(function (err, cachedData) {
      if (err) { return cb(err) }
      logger.log.trace({
        tx: true,
        cachedData: !!cachedData
      }, 'Github.prototype._runQueryAgainstCache fetchCachedQueryDataAndMakeDecision' +
        ' - redis cached data')
      if (!cachedData) {
        // if we don't have cached data make the request to get it
        logger.log.trace({
          tx: true
        }, 'Github.prototype._runQueryAgainstCache fetchCachedQueryDataAndMakeDecision' +
          ' - going to make the query')
        // middle `null` triggers fetch
        cb(null, null, false)
      } else {
        // our data is valid!
        if (!cacheQueue[stringKey.key]) {
          // if nobody has been passed through to update the cache EX yet
          logger.log.trace({
            tx: true,
            stringKey: stringKey.key
          }, 'Github.prototype._runQueryAgainstCache fetchCachedQueryDataAndMakeDecision' +
            ' - setting cacheQueue')
          cacheQueue[stringKey.key] = true
          cb(null, cachedData, true /* triggers cache EX update */)
        } else {
          // someone else is refreshing the cache EX... just use the data
          logger.log.trace({
            tx: true
          }, 'Github.prototype._runQueryAgainstCache fetchCachedQueryDataAndMakeDecision' +
            ' - just using the cached data')
          cb(null, cachedData, false)
        }
      }
    })
  }

  function checkDataAndRunAnyRequest (cachedData, updateCacheEx, cb) {
    logger.log.trace({
      tx: true,
      cachedData: !!cachedData,
      updateCacheEx: !!updateCacheEx
    }, 'Github.prototype._runQueryAgainstCache checkDataAndRunAnyRequest')
    var githubResponse
    if (cachedData) {
      // if we got redis data... just use it and keep going
      cachedData = JSON.parse(cachedData)
      cb(null, cachedData)
      // if we are to update the cache EX, do that! so set the callback we will use
      if (updateCacheEx) {
        runQuery(true, function () {
          logger.log.trace({
            tx: true,
            stringKey: stringKey.key
          }, 'Github.prototype._runQueryAgainstCache checkDataAndRunAnyRequest' +
            ' - deleting cacheQueue')
          delete cacheQueue[stringKey.key]
        })
      }
    } else {
      // we don't have data, so we need to make the request
      runQuery(false, cb)
    }

    /* jshint maxcomplexity:6 */
    function runQuery (sendConditionalHeader, cb) {
      logger.log.trace({
        tx: true,
        query: options.debug
      }, 'Github.prototype._runQueryAgainstCache checkDataAndRunAnyRequest' +
        ' - runQuery')
      // this is a shim so we can get a hold of the full github response
      // self._httpSend = self.httpSend
      if (sendConditionalHeader) {
        cacheQueue[stringKey.key] = self.httpSend
      } else {
        self._httpSend = self.httpSend
      }
      self.httpSend = function () {
        var args = Array.prototype.slice.call(arguments)
        if (typeof args[2] === 'function') {
          var httpSendCb = args.pop()
          args.push(function (err, res) {
            githubResponse = res
            httpSendCb(err, res)
          })
        }
        if (sendConditionalHeader) {
          cacheQueue[stringKey.key].apply(self, args)
        } else {
          self._httpSend.apply(self, args)
        }
      }
      if (sendConditionalHeader) {
        if (!opts.headers) { opts.headers = {} }
        opts.headers['if-none-match'] = keypather.get(cachedData, 'meta.etag')
      }
      query(opts, function (err, data) {
        if (sendConditionalHeader) {
          self.httpSend = cacheQueue[stringKey.key]
        } else {
          self.httpSend = self._httpSend
        }
        if (err) {
          if (err.code && err.message) {
            return cb(Boom.create(err.code, err.message))
          } else {
            return cb(err)
          }
        }

        if (sendConditionalHeader && /^304.*/.test(data.meta.status)) {
          cache304Response(stringKey, function () {
            cb(err, cachedData)
          })
        } else {
          // re-format data
          var saveData = {}
          if (data.meta) {
            saveData.meta = data.meta
            delete data.meta
          }
          saveData.data = data
          cacheFullResponse(stringKey, saveData, function () {
            cb(err, saveData)
          })
        }
      })
    }
    /* jshint maxcomplexity:5 */

    function cache304Response (key, cb) {
      var cc = parseCacheControl(keypather.get(githubResponse, 'headers.cache-control'))
      logger.log.trace({
        tx: true
      }, 'Github.prototype._runQueryAgainstCache checkDataAndRunAnyRequest' +
        ' - extending the caches expiration')
      key.expire(cc['max-age'] || 60, cb)
    }

    function cacheFullResponse (key, data, cb) {
      var d = JSON.stringify(data)
      var cc = parseCacheControl(keypather.get(githubResponse, 'headers.cache-control'))
      logger.log.trace({
        tx: true,
        key: key,
        d: d
      }, 'Github.prototype._runQueryAgainstCache checkDataAndRunAnyRequest' +
        ' - caching the response')
      key.setex(cc['max-age'] || 60, d, cb)
    }
  }
}

Github.prototype._listRepoHooks = function (shortRepo, cb) {
  logger.log.info({
    tx: true,
    shortRepo: shortRepo
  }, 'Github.prototype._listRepoHooks')
  var split = shortRepo.split('/')
  var query = {
    user: split[0],
    repo: split[1],
    per_page: 100
  }
  this.repos.getHooks(query, function (err, hooks) {
    if (err) {
      logger.log.error({
        tx: true,
        err: err
      }, 'Github.prototype._listRepoHooks - back from listing hook err')
      err = (err.code === 404)
        ? Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err })
        : Boom.create(502, 'Failed to get github repo hooks for ' + shortRepo, { err: err })
      return cb(err)
    }
    // node-github doesn't follow redirect for now.
    // see https://github.com/mikedeboer/node-github/issues/257
    // we can implement them here, but it doesn't matter to us at this point
    // node-github returns `hooks` as object with redirect information instead of
    // array with hooks data
    if (hooks.message === 'Moved Permanently') {
      var boomErr = Boom.notFound('Github repo ' + shortRepo + ' not found, because it moved')
      logger.log.error({
        tx: true,
        err: boomErr
      }, 'Github.prototype._listRepoHooks - back from listing hook err')
      return cb(boomErr)
    }
    logger.log.trace({
      tx: true,
      hooks: hooks
    }, 'Github.prototype._listRepoHooks - back from listing hook sucess')
    cb(null, hooks)
  })
}

Github.prototype._createRepoHook = function (shortRepo, cb) {
  logger.log.info({
    tx: true,
    shortRepo: shortRepo
  }, 'Github.prototype._createRepoHook')
  var split = shortRepo.split('/')
  var hookUrl = process.env.FULL_API_DOMAIN + process.env.GITHUB_HOOK_PATH
  var query = {
    user: split[0],
    repo: split[1],
    name: process.env.GITHUB_HOOK_NAME,
    config: {
      url: hookUrl,
      content_type: 'json'
    },
    events: ['*']
  }

  this.repos.createHook(query, function (err, hook) {
    logger.log.trace({
      tx: true,
      err: err
    }, 'Github.prototype._createRepoHook - back from creating hook')
    if (err) {
      err = (err.code === 404)
        ? Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err })
        : Boom.create(502, 'Failed to create github repo hook for ' + shortRepo, { err: err })
      cb(err)
    } else {
      cb(null, hook)
    }
  })
}

Github.prototype._updateRepoHook = function (hookId, shortRepo, cb) {
  logger.log.info({
    tx: true,
    hookId: hookId,
    shortRepo: shortRepo
  }, 'Github.prototype._updateRepoHook')
  var split = shortRepo.split('/')
  var hookUrl = process.env.FULL_API_DOMAIN + process.env.GITHUB_HOOK_PATH
  var query = {
    user: split[0],
    repo: split[1],
    name: process.env.GITHUB_HOOK_NAME,
    config: {
      url: hookUrl,
      content_type: 'json'
    },
    events: ['*'],
    id: hookId
  }

  this.repos.updateHook(query, function (err, hook) {
    if (err) {
      logger.log.error({
        tx: true,
        hookId: hookId,
        err: err
      }, 'Github.prototype._updateRepoHook - back from updating hook')
      err = (err.code === 404)
        ? Boom.notFound('Github repo hook ' + hookId + ' not found.', { err: err })
        : Boom.create(502, 'Failed to update github repo hook with id ' + hookId, { err: err })
      return cb(err)
    }
    logger.log.error({
      tx: true,
      hookId: hookId,
      err: err
    }, 'Github.prototype._updateRepoHook - back from updating hook')
    cb(null, hook)
  })
}

Github.prototype._deleteRepoHook = function (hookId, shortRepo, cb) {
  logger.log.info({
    tx: true,
    hookId: hookId,
    shortRepo: shortRepo
  }, 'Github.prototype._deleteRepoHook')
  var split = shortRepo.split('/')
  var query = {
    user: split[0],
    repo: split[1],
    id: hookId
  }

  this.repos.deleteHook(query, function (err, hook) {
    if (err) {
      err = (err.code === 404)
        ? Boom.notFound('Github repo hook ' + hookId + ' not found.', { err: err })
        : Boom.create(502, 'Failed to delete github repo hook with id ' + hookId, { err: err })
      logger.log.error({
        tx: true,
        hookId: hookId,
        err: err
      }, 'Github.prototype._deleteRepoHook: error')
      return cb(err)
    }
    logger.log.trace({
      tx: true,
      hookId: hookId
    }, 'Github.prototype._deleteRepoHook: success')
    cb(null, hook)
  })
}

Github.prototype.createRepoHookIfNotAlready = function (shortRepo, cb) {
  var self = this
  logger.log.info({
    tx: true,
    shortRepo: shortRepo
  }, 'Github.prototype.createRepoHookIfNotAlready')
  var hookUrl = process.env.FULL_API_DOMAIN + process.env.GITHUB_HOOK_PATH
  async.waterfall([
    this._listRepoHooks.bind(this, shortRepo),
    function subscribeToHooksIfNotAlready (existingHooks, cb) {
      var hookExists = find(existingHooks, hasKeypaths({
        'config.url': hookUrl,
        active: true
      }))
      logger.log.trace({
        tx: true,
        hookExists: !!hookExists
      }, 'Github.prototype.createRepoHookIfNotAlready - hook was found?')
      if (hookExists) {
        if (hookExists.events[0] === '*') {
          cb(null, hookExists)
        } else {
          // TODO (anton) let's remove this if migration will work on production without errors.
          self._updateRepoHook(hookExists.id, shortRepo, cb)
        }
      } else {
        self._createRepoHook(shortRepo, cb)
      }
    }
  ], function (err) {
    logger.log.trace({
      tx: true,
      shortRepo: shortRepo
    }, 'Github.prototype.createRepoHookIfNotAlready - hook checked (and created)')
    cb(err)
  })
}

Github.prototype.createDeployment = function (shortRepo, query, cb) {
  logger.log.info({
    tx: true,
    shortRepo: shortRepo,
    query: query
  }, 'Github.prototype.createDeployment')
  var split = shortRepo.split('/')
  query.user = split[0]
  query.repo = split[1]
  this.repos.createDeployment(query, function (err, deployment) {
    if (err) {
      err = (err.code === 404)
        ? Boom.notFound('Cannot find repo or ref: ' + shortRepo,
          { err: err, report: false, query: query })
        : Boom.create(502, 'Failed to find repo or ref ' + shortRepo,
          { err: err, query: query })
      return cb(err)
    }
    cb(null, deployment)
  })
}

Github.prototype.createDeploymentStatus = function (shortRepo, query, cb) {
  logger.log.info({
    tx: true,
    shortRepo: shortRepo,
    query: query
  }, 'Github.prototype.createDeploymentStatus')
  var split = shortRepo.split('/')
  query.user = split[0]
  query.repo = split[1]
  this.repos.createDeploymentStatus(query, function (err, deployment) {
    if (err) {
      err = (err.code === 404)
        ? Boom.notFound('Cannot find repo, ref or deployment: ' + shortRepo,
          { err: err, report: false, query: query })
        : Boom.create(502, 'Failed to find repo, ref or deployment ' + shortRepo,
          { err: err, query: query })
      return cb(err)
    }
    cb(null, deployment)
  })
}

Github.prototype.isOrgMember = function (orgName, cb) {
  logger.log.info({
    tx: true,
    orgName: orgName
  }, 'Github.prototype.isOrgMember')
  var notFoundError = Boom.notFound('user is not a member of org', { org: orgName })
  /* jshint maxcomplexity:6 */
  this.getUserAuthorizedOrgs(function (err, orgs) {
    if (err) {
      if (err.code === 404) {
        return cb(notFoundError)
      }
      return cb(Boom.create(502, 'failed to get user orgs', { err: err }))
    }
    if (!orgs || orgs.length === 0) {
      return cb(notFoundError)
    }
    var org = find(orgs, hasProps({login: orgName}))
    if (!org) {
      return cb(notFoundError)
    }
    return cb(null, true)
  })
}

Github.prototype.checkForDeployKey = function (repo, cb) {
  logger.log.info({
    tx: true,
    repo: repo
  }, 'Github.prototype.checkForDeployKey')
  this.getDeployKeys(repo, function (err, keys) {
    logger.log.trace({
      tx: true,
      repo: repo,
      err: err
    }, 'Github.prototype.checkForDeployKey - back from pulling deploy keys')
    if (err) { return cb(err) }
    var key = find(keys, hasProps({ title: process.env.GITHUB_DEPLOY_KEY_TITLE }))
    cb(err, key)
  })
}

Github.prototype.addDeployKey = function (repo, cb) {
  logger.log.info({
    tx: true,
    repo: repo
  }, 'Github.prototype.addDeployKey')
  var self = this
  var split = repo.split('/')
  async.waterfall([
    function getKeypair (cb) {
      Keypair.findOneAndRemove({}, function (err, doc) {
        if (err) {
          cb(err)
        } else if (!doc) {
          cb(Boom.create(503, 'unable to generate keypair'))
        } else {
          cb(err, doc)
        }
      })
    },
    function (keypair, cb) {
      logger.log.trace({
        tx: true,
        repo: repo
      }, 'Github.prototype.addDeployKey - creating deploy key')
      self.repos.createKey({
        user: split[0],
        repo: split[1],
        title: process.env.GITHUB_DEPLOY_KEY_TITLE,
        key: keypair.publicKey
      }, function (err) {
        logger.log.trace({
          tx: true,
          repo: repo,
          err: err
        }, 'Github.prototype.addDeployKey - done creating deploy key')
        cb(err, keypair)
      })
    },
    function (keypair, cb) {
      async.parallel({
        publicKey: s3.putObject.bind(s3, {
          Bucket: process.env.GITHUB_DEPLOY_KEYS_BUCKET,
          Key: repo + '.key.pub',
          Body: keypair.publicKey,
          ServerSideEncryption: 'AES256'
        }),
        privateKey: s3.putObject.bind(s3, {
          Bucket: process.env.GITHUB_DEPLOY_KEYS_BUCKET,
          Key: repo + '.key',
          Body: keypair.privateKey,
          ServerSideEncryption: 'AES256'
        })
      }, cb)
    }
  ], cb)
}

Github.prototype.addDeployKeyIfNotAlready = function (repo, cb) {
  logger.log.info({
    tx: true,
    repo: repo
  }, 'Github.prototype.addDeployKeyIfNotAlready')
  var self = this
  async.waterfall([
    self.checkForDeployKey.bind(self, repo),
    function (key, cb) {
      if (!key) { self.addDeployKey(repo, cb) } else { cb(null) }
    }
  ], function (err) {
    if (err) { return cb(err) }
    cb(null, {
      publicKey: repo + '.key.pub',
      privateKey: repo + '.key'
    })
  })
}
