/**
 * GitHub API request wrapper methods
 * @module lib/models/apis/github
 */
'use strict'

const Promise = require('bluebird')
const Boom = require('dat-middleware').Boom
const GithubApi = require('github')
const async = require('async')
const aws = require('aws-sdk')
const crypto = require('crypto')
const defaults = require('defaults')
const find = require('101/find')
const hasKeypaths = require('101/has-keypaths')
const hasProps = require('101/has-properties')
const keypather = require('keypather')()
// redis-types needs redis to be required _first_
require('models/redis')
const put = require('101/put')
const util = require('util')

const Keypair = require('models/mongo/keypair')
const logger = require('middlewares/logger')(__filename)

const s3 = new aws.S3()

module.exports = Github

function Github (opts) {
  opts = defaults(opts, {
    // required
    version: '3.0.0',
    // Github cache configuration
    protocol: process.env.GITHUB_PROTOCOL,
    host: process.env.GITHUB_VARNISH_HOST,
    port: process.env.GITHUB_VARNISH_PORT,
    // optional
    debug: false, // envIs('development', 'test'),
    requestMedia: 'application/json'
  })
  GithubApi.call(this, opts)
  if (opts.token) {
    logger.log.info('Github authenticate with token')
    this.token = opts.token
    var md5sum = crypto.createHash('md5')
    md5sum.update(opts.token)
    this.tokenHash = md5sum.digest('hex')
    this.authenticate({
      type: 'oauth',
      token: opts.token
    })
  } else {
    logger.log.info('Github authenticate without token')
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
    repo: repo
  }, 'Github.prototype.getRepo')
  var split = repo.split('/')
  return this.repos.get({
    user: split[0],
    repo: split[1]
  }, this.errorHandler(cb))
}

Github.prototype.getRepoContent = function (repo, fullPath, cb) {
  logger.log.info({
    repo: repo,
    fullPath: fullPath
  }, 'Github.prototype.getRepoContent')
  var split = repo.split('/')
  return this.repos.getContent({
    user: split[0],
    repo: split[1],
    path: fullPath
  }, this.errorHandler(cb))
}

Github.prototype.getDeployKeys = function (repo, cb) {
  logger.log.info({
    repo: repo
  }, 'Github.prototype.getDeployKeys')
  var split = repo.split('/')
  this.repos.getKeys({
    user: split[0],
    repo: split[1],
    per_page: 100
  }, this.errorHandler(cb))
}

Github.prototype.getCommit = function (repo, commit, cb) {
  logger.log.info({
    repo: repo,
    commit: commit
  }, 'Github.prototype.getCommit')
  var splitRepo = repo.split('/')
  var ownername = splitRepo[0]
  var reponame = splitRepo[1]
  return this.repos.getCommit({ user: ownername, repo: reponame, sha: commit }, this.errorHandler(cb))
}

Github.prototype.getBranch = function (repo, branch, cb) {
  logger.log.info({
    repo: repo,
    branch: branch
  }, 'Github.prototype.getBranch')
  var splitRepo = repo.split('/')
  var ownername = splitRepo[0]
  var reponame = splitRepo[1]
  return this.repos.getBranch({ user: ownername, repo: reponame, branch: branch }, this.errorHandler(cb))
}

Github.prototype.getAuthorizedUser = function (cb) {
  logger.log.info('Github.prototype.getAuthorizedUser')
  if (!this.token) {
    return cb(Boom.badImplementation('getAuthorizedUser should only be called with a user token'))
  }
  this.user.get({}, this.errorHandler(cb))
}

Github.prototype.getUserEmails = function (userId, cb) {
  logger.log.info('Github.prototype.getUserEmails')
  if (!this.token) {
    return cb(Boom.badImplementation('getUserEmail should only be called with a user token'))
  }
  return this.user.getEmails({ user: userId }, this.errorHandler(cb))
}

Github.prototype.getUserByUsername = function (username, cb) {
  logger.log.info({
    username: username
  }, 'Github.prototype.getUserByUsername')
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  console.log(Object.keys(this.user))
  console.log(this.user.getFrom)
  console.log('username', username)
  return this.user.getFrom({ user: username }, this.errorHandler(cb))
}

Github.prototype.getUserById = function (githubId, cb) {
  logger.log.info({
    githubId: githubId
  }, 'Github.prototype.getUserById')
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  return this.user.getById({ id: githubId }, this.errorHandler(cb))
}

Github.prototype.getUserAuthorizedOrgs = function (cb) {
  logger.log.info('Github.prototype.getUserAuthorizedOrgs')
  if (!this.token) {
    var errorMsg = 'getUserAuthorizedOrgs should only be called with a user token'
    return cb(Boom.badImplementation(errorMsg))
  }
  return this.user.getOrgs({}, this.errorHandler(cb))
}

/**
 * Get all member for a Github organization
 *
 * @param {String}   githubOrgName
 * @param {Function} cb: {Error, Array}
 */
Github.prototype.getOrgMembers = function (githubOrgName, cb) {
  logger.log.info('Github.prototype.getUserAuthorizedOrgs')
  if (!this.token) {
    var errorMsg = 'getOrgMember should only be called with a user token'
    return cb(Boom.badImplementation(errorMsg))
  }
  return this.orgs.getMembers({ org: githubOrgName }, this.errorHandler(cb))
}

Github.prototype._listRepoHooks = function (shortRepo, cb) {
  logger.log.info({
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
        err: boomErr
      }, 'Github.prototype._listRepoHooks - back from listing hook err')
      return cb(boomErr)
    }
    logger.log.trace({
      hooks: hooks
    }, 'Github.prototype._listRepoHooks - back from listing hook sucess')
    cb(null, hooks)
  })
}

Github.prototype._createRepoHook = function (shortRepo, cb) {
  var logData = {
    shortRepo: shortRepo
  }
  logger.log.info(logData, 'Github.prototype._createRepoHook')
  var split = shortRepo.split('/')
  var hookUrl = process.env.GITHUB_WEBHOOK_URL
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
    if (err) {
      logger.log.error(put({ err: err }, logData), '_createRepoHook - back from creating hook')
      if (err.code === 404) {
        return cb(Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err }))
      }
      // happens when hooks already exist in repo
      // can happen when two users simultaneously were trying to setup same repo
      if (err.code === 422 && err.message.match(/Hook already exists on this repository/)) {
        var conflictErr = Boom.conflict('Github repo ' + shortRepo + ' already has a hook.',
          { err: err })
        return cb(conflictErr)
      }
      var boomErr = Boom.create(502, 'Failed to create github repo hook for ' + shortRepo,
        { err: err })
      return cb(boomErr)
    }
    logger.log.trace(logData, '_createRepoHook - back from creating hook')
    cb(null, hook)
  })
}

Github.prototype._updateRepoHook = function (hookId, shortRepo, cb) {
  logger.log.info({
    hookId: hookId,
    shortRepo: shortRepo
  }, 'Github.prototype._updateRepoHook')
  var split = shortRepo.split('/')
  var hookUrl = process.env.GITHUB_WEBHOOK_URL
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
        hookId: hookId,
        err: err
      }, '_updateRepoHook - back from updating hook')
      err = (err.code === 404)
        ? Boom.notFound('Github repo hook ' + hookId + ' not found.', { err: err })
        : Boom.create(502, 'Failed to update github repo hook with id ' + hookId, { err: err })
      return cb(err)
    }
    logger.log.trace({
      hookId: hookId
    }, '_updateRepoHook - back from updating hook')
    cb(null, hook)
  })
}

Github.prototype._deleteRepoHook = function (hookId, shortRepo, cb) {
  logger.log.info({
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
        hookId: hookId,
        err: err
      }, 'Github.prototype._deleteRepoHook: error')
      return cb(err)
    }
    logger.log.trace({
      hookId: hookId
    }, 'Github.prototype._deleteRepoHook: success')
    cb(null, hook)
  })
}

Github.prototype.createRepoHookIfNotAlready = function (shortRepo, cb) {
  var self = this
  var logData = {
    shortRepo: shortRepo
  }
  logger.log.info(logData, 'Github.prototype.createRepoHookIfNotAlready')
  var hookUrl = process.env.GITHUB_WEBHOOK_URL
  this._listRepoHooks(shortRepo, function (err, existingHooks) {
    if (err) {
      logger.log.error(put({
        err: err }, logData),
        'Github.prototype.createRepoHookIfNotAlready error listing hooks')
      return cb(err)
    }
    var hookExists = find(existingHooks, hasKeypaths({
      'config.url': hookUrl,
      active: true,
      'events[0]': '*'
    }))
    if (hookExists) {
      logger.log.info(logData, 'Github.prototype.createRepoHookIfNotAlready hook found')
      return cb(null, hookExists)
    }
    self._createRepoHook(shortRepo, function (err) {
      var code = keypather.get(err, 'output.statusCode')
      // we should ignore 409 because hooks was already created
      if (err && code !== 409) {
        logger.log.error(put({
          err: err }, logData),
          'Github.prototype.createRepoHookIfNotAlready error creating hook')
        return cb(err)
      }
      logger.log.info(logData, 'Github.prototype.createRepoHookIfNotAlready hook created')
      cb(null)
    })
  })
}

Github.prototype.isOrgMember = function (orgName, cb) {
  logger.log.info({
    orgName: orgName
  }, 'Github.prototype.isOrgMember')
  var notFoundError = Boom.notFound('user is not a member of org', { org: orgName, report: false })
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
    repo: repo
  }, 'Github.prototype.checkForDeployKey')
  this.getDeployKeys(repo, function (err, keys) {
    if (err) {
      logger.log.error({
        repo: repo,
        err: err
      }, 'checkForDeployKey - back from pulling deploy keys')
      return cb(err)
    }
    logger.log.trace({
      repo: repo
    }, 'checkForDeployKey - back from pulling deploy keys')
    var key = find(keys, hasProps({ title: process.env.GITHUB_DEPLOY_KEY_TITLE }))
    cb(err, key)
  })
}

Github.prototype.addDeployKey = function (repo, cb) {
  logger.log.info({
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
        repo: repo
      }, 'Github.prototype.addDeployKey - creating deploy key')
      self.repos.createKey({
        user: split[0],
        repo: split[1],
        title: process.env.GITHUB_DEPLOY_KEY_TITLE,
        key: keypair.publicKey
      }, function (err) {
        if (err) {
          logger.log.error({
            repo: repo,
            err: err
          }, 'Github.prototype.addDeployKey - done creating deploy key')
        } else {
          logger.log.trace({
            repo: repo
          }, 'Github.prototype.addDeployKey - done creating deploy key')
        }
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

Github.prototype.errorHandler = function (cb) {
  return function (err, data) {
    if (err) {
      if (err.code && err.message) {
        return cb(Boom.create(err.code, err.message))
      }
      return cb(err)
    }
    return cb(null, data)
  }
}

Promise.promisifyAll(Github)
Promise.promisifyAll(Github.prototype)
