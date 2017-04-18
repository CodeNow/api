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

const Keypair = require('models/mongo/keypair')
const put = require('101/put')
const util = require('util')
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
    const md5sum = crypto.createHash('md5')
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
  this.logger = logger.log.child({
    withToken: !!this.token
  })
}

util.inherits(Github, GithubApi)

Github.prototype.getRepo = function (repo, cb) {
  const log = this.logger.child({
    repo,
    method: 'getRepo'
  })
  log.trace('called')
  const split = repo.split('/')
  return this.repos.get({
    owner: split[0],
    repo: split[1]
  }, this.errorHandler(cb))
}

Github.prototype.getRepoContent = function (repo, fullPath, commitRef) {
  const log = this.logger.child({
    repo,
    fullPath,
    commitRef,
    method: 'getRepoContent'
  })
  log.trace('called')
  const split = repo.split('/')
  return Promise.fromCallback(cb => {
    this.repos.getContent({
      owner: split[0],
      repo: split[1],
      path: fullPath
    }, this.errorHandler(cb))
  })
    .catch((err) => {
      if (err.isBoom && err.output.statusCode === 404) {
        throw Boom.notFound('Unable to find file on github: ' + repo + fullPath + ' for commit ' + commitRef, { err: err })
      }
      throw err
    })
}

Github.prototype.getDeployKeys = function (repo, cb) {
  const log = this.logger.child({
    repo,
    method: 'getDeployKeys'
  })
  log.trace('called')
  const split = repo.split('/')
  this.repos.getKeys({
    owner: split[0],
    repo: split[1],
    per_page: 100
  }, this.errorHandler(cb))
}

Github.prototype.getCommit = function (repo, commit, cb) {
  const log = this.logger.child({
    repo,
    commit,
    method: 'getCommit'
  })
  log.trace('called')
  const splitRepo = repo.split('/')
  const ownername = splitRepo[0]
  const reponame = splitRepo[1]
  return this.repos.getCommit({
    owner: ownername,
    repo: reponame,
    sha: commit
  }, this.errorHandler(cb))
}

Github.prototype.getBranch = function (repo, branch, cb) {
  const log = this.logger.child({
    repo,
    branch,
    method: 'getBranch'
  })
  log.trace('called')
  const splitRepo = repo.split('/')
  const ownername = splitRepo[0]
  const reponame = splitRepo[1]
  const getBranchArgs = {
    owner: ownername,
    repo: reponame,
    branch
  }
  return this.repos.getBranch(getBranchArgs, this.errorHandler(cb, {
    method: 'getBranch',
    args: getBranchArgs
  }))
}

Github.prototype.getAuthorizedUser = function (cb) {
  const log = this.logger.child({
    method: 'getAuthorizedUser'
  })
  log.info('called')
  if (!this.token) {
    return cb(Boom.badImplementation('getAuthorizedUser should only be called with a user token'))
  }
  this.users.get({}, this.errorHandler(cb))
}

Github.prototype.getUserEmails = function (userId, cb) {
  const log = this.logger.child({
    userId,
    method: 'getUserEmails'
  })
  log.info('called')
  if (!this.token) {
    return cb(Boom.badImplementation('getUserEmail should only be called with a user token'))
  }
  return this.users.getEmails({ user: userId }, this.errorHandler(cb))
}

Github.prototype.getUserByUsername = function (username, cb) {
  const log = this.logger.child({
    username,
    method: 'getUserByUsername'
  })
  log.info('called')
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  return this.users.getForUser({ user: username }, this.errorHandler(cb))
}

Github.prototype.getUserById = function (githubId, cb) {
  const log = this.logger.child({
    githubId,
    method: 'getUserById'
  })
  log.info('called')
  // WARNING: this is getting the information we can get through our api token.
  // this does not return ALL user data, use Github.getUser for that.
  return this.users.getById({ id: githubId }, this.errorHandler(cb))
}

Github.prototype.getUserAuthorizedOrgs = function (cb) {
  const log = this.logger.child({
    method: 'getUserAuthorizedOrgs'
  })
  log.info('called')
  if (!this.token) {
    const errorMsg = 'getUserAuthorizedOrgs should only be called with a user token'
    return cb(Boom.badImplementation(errorMsg))
  }
  return this.users.getOrgs({}, this.errorHandler(cb))
}

/**
 * Get all member for a Github organization
 *
 * @param {String}   githubOrgName
 * @param {Function} cb: {Error, Array}
 */
Github.prototype.getOrgMembers = function (githubOrgName, cb) {
  const log = this.logger.child({
    githubOrgName,
    method: 'getOrgMembers'
  })
  log.info('called')
  if (!this.token) {
    const errorMsg = 'getOrgMember should only be called with a user token'
    return cb(Boom.badImplementation(errorMsg))
  }
  return this.orgs.getMembers({ org: githubOrgName }, this.errorHandler(cb))
}

Github.prototype._listRepoHooks = function (shortRepo, cb) {
  const log = this.logger.child({
    shortRepo,
    method: '_listRepoHooks'
  })
  log.info('called')
  const split = shortRepo.split('/')
  const query = {
    owner: split[0],
    repo: split[1],
    per_page: 100
  }
  this.repos.getHooks(query, (err, hooks) => {
    if (err) {
      this.logger.error({
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
      const boomErr = Boom.notFound('Github repo ' + shortRepo + ' not found, because it moved')
      this.logger.error({
        err: boomErr
      }, 'Github.prototype._listRepoHooks - back from listing hook err')
      return cb(boomErr)
    }
    this.logger.trace({
      hooks: hooks
    }, 'Github.prototype._listRepoHooks - back from listing hook sucess')
    cb(null, hooks)
  })
}

Github.prototype._createRepoHook = function (shortRepo, cb) {
  const log = this.logger.child({
    shortRepo,
    method: '_createRepoHook'
  })
  log.info('called')
  const split = shortRepo.split('/')
  const hookUrl = process.env.GITHUB_WEBHOOK_URL
  const query = {
    owner: split[0],
    repo: split[1],
    name: process.env.GITHUB_HOOK_NAME,
    config: {
      url: hookUrl,
      content_type: 'json'
    },
    events: ['*']
  }

  this.repos.createHook(query, (err, hook) => {
    if (err) {
      log.error({err}, 'error creating hook')
      if (err.code === 404) {
        return cb(Boom.notFound('Github repo ' + shortRepo + ' not found.', { err: err }))
      }
      // happens when hooks already exist in repo
      // can happen when two users simultaneously were trying to setup same repo
      if (err.code === 422 && err.message.match(/Hook already exists on this repository/)) {
        const conflictErr = Boom.conflict('Github repo ' + shortRepo + ' already has a hook.',
          { err: err })
        return cb(conflictErr)
      }
      const boomErr = Boom.create(502, 'Failed to create github repo hook for ' + shortRepo,
        { err: err })
      return cb(boomErr)
    }
    log.trace('hook created')
    cb(null, hook)
  })
}

Github.prototype._updateRepoHook = function (hookId, shortRepo, cb) {
  const log = this.logger.child({
    hookId,
    shortRepo,
    method: '_updateRepoHook'
  })
  log.info('called')
  const split = shortRepo.split('/')
  const hookUrl = process.env.GITHUB_WEBHOOK_URL
  const query = {
    owner: split[0],
    repo: split[1],
    name: process.env.GITHUB_HOOK_NAME,
    config: {
      url: hookUrl,
      content_type: 'json'
    },
    events: ['*'],
    id: hookId
  }

  this.repos.updateHook(query, (err, hook) => {
    if (err) {
      this.logger.error({
        hookId: hookId,
        err: err
      }, '_updateRepoHook - back from updating hook')
      err = (err.code === 404)
        ? Boom.notFound('Github repo hook ' + hookId + ' not found.', { err: err })
        : Boom.create(502, 'Failed to update github repo hook with id ' + hookId, { err: err })
      return cb(err)
    }
    this.logger.trace({
      hookId: hookId
    }, '_updateRepoHook - back from updating hook')
    cb(null, hook)
  })
}

Github.prototype._deleteRepoHook = function (hookId, shortRepo, cb) {
  this.logger.info({
    hookId,
    shortRepo
  }, 'Github.prototype._deleteRepoHook')
  const split = shortRepo.split('/')
  const query = {
    owner: split[0],
    repo: split[1],
    id: hookId
  }

  this.repos.deleteHook(query, (err, hook) => {
    if (err) {
      err = (err.code === 404)
        ? Boom.notFound('Github repo hook ' + hookId + ' not found.', { err: err })
        : Boom.create(502, 'Failed to delete github repo hook with id ' + hookId, { err: err })
      this.logger.error({
        hookId: hookId,
        err: err
      }, 'Github.prototype._deleteRepoHook: error')
      return cb(err)
    }
    this.logger.trace({
      hookId: hookId
    }, 'Github.prototype._deleteRepoHook: success')
    cb(null, hook)
  })
}

Github.prototype.createRepoHookIfNotAlready = function (shortRepo, cb) {
  const log = this.logger.child({
    shortRepo,
    method: 'createRepoHookIfNotAlready'
  })
  log.info('called')
  const hookUrl = process.env.GITHUB_WEBHOOK_URL
  this._listRepoHooks(shortRepo, (err, existingHooks) => {
    if (err) {
      log.error({ err }, 'error listing hooks')
      return cb(err)
    }
    const hookExists = find(existingHooks, hasKeypaths({
      'config.url': hookUrl,
      active: true,
      'events[0]': '*'
    }))
    if (hookExists) {
      log.info('hook found')
      return cb(null, hookExists)
    }
    this._createRepoHook(shortRepo, (err) => {
      const code = keypather.get(err, 'output.statusCode')
      // we should ignore 409 because hooks was already created
      if (err && code !== 409) {
        log.error({err}, 'error creating hook')
        return cb(err)
      }
      log.info('hook created')
      cb(null)
    })
  })
}

Github.prototype.isOrgMember = function (orgName, cb) {
  const log = this.logger.child({
    orgName,
    method: 'isOrgMember'
  })
  log.info('called')
  const notFoundError = Boom.notFound('user is not a member of org', { org: orgName, report: false })
  /* jshint maxcomplexity:6 */
  this.getUserAuthorizedOrgs((err, orgs) => {
    if (err) {
      if (err.code === 404) {
        return cb(notFoundError)
      }
      return cb(Boom.create(502, 'failed to get user orgs', { err: err }))
    }
    if (!orgs || orgs.length === 0) {
      return cb(notFoundError)
    }
    const org = find(orgs, hasProps({login: orgName}))
    if (!org) {
      return cb(notFoundError)
    }
    return cb(null, true)
  })
}

Github.prototype.checkForDeployKey = function (repo, cb) {
  const log = this.logger.child({
    repo,
    method: 'checkForDeployKey'
  })
  log.info('called')
  this.getDeployKeys(repo, (err, keys) => {
    if (err) {
      this.logger.error({
        repo: repo,
        err: err
      }, 'checkForDeployKey - back from pulling deploy keys')
      return cb(err)
    }
    this.logger.trace({
      repo: repo
    }, 'checkForDeployKey - back from pulling deploy keys')
    const key = find(keys, hasProps({ title: process.env.GITHUB_DEPLOY_KEY_TITLE }))
    cb(err, key)
  })
}

Github.prototype.addDeployKey = function (repo, cb) {
  const log = this.logger.child({
    repo,
    method: 'addDeployKey'
  })
  log.info('called')
  const split = repo.split('/')
  async.waterfall([
    (cb) => {
      Keypair.findOneAndRemove({}, (err, doc) => {
        if (err) {
          cb(err)
        } else if (!doc) {
          cb(Boom.create(503, 'unable to generate keypair'))
        } else {
          cb(err, doc)
        }
      })
    },
    (keypair, cb) => {
      this.logger.trace({
        repo: repo
      }, 'Github.prototype.addDeployKey - creating deploy key')
      this.repos.createKey({
        owner: split[0],
        repo: split[1],
        title: process.env.GITHUB_DEPLOY_KEY_TITLE,
        key: keypair.publicKey
      }, (err) => {
        if (err) {
          this.logger.error({
            repo: repo,
            err: err
          }, 'Github.prototype.addDeployKey - done creating deploy key')
        } else {
          this.logger.trace({
            repo: repo
          }, 'Github.prototype.addDeployKey - done creating deploy key')
        }
        cb(err, keypair)
      })
    },
    (keypair, cb) => {
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
  const log = this.logger.child({
    repo,
    method: 'addDeployKeyIfNotAlready'
  })
  log.info('called')
  async.waterfall([
    this.checkForDeployKey.bind(this, repo),
    (key, cb) => {
      if (!key) { this.addDeployKey(repo, cb) } else { cb(null) }
    }
  ], (err) => {
    if (err) { return cb(err) }
    cb(null, {
      publicKey: repo + '.key.pub',
      privateKey: repo + '.key'
    })
  })
}

Github.prototype.errorHandler = function (cb, loggingData) {
  const log = this.logger.child({
    method: 'errorHandler',
    loggingData
  })
  return (err, data) => {
    if (err) {
      log.trace('error')
      if (err.code && err.message) {
        return cb(Boom.create(err.code, err.message))
      }
      return cb(err)
    }
    log.trace({
      data
    }, 'success')
    return cb(null, data)
  }
}

/**
 * @param  {String} repoName format: Runnable/hello-node
 * @return {Object}
 *         {String} .publicKey
 *         {String} .privateKey
 */
Github.prototype.createHooksAndKeys = function (repoName) {
  const log = this.logger.child({
    repoName,
    method: 'createHooksAndKeys'
  })
  log.info('called')
  return Promise.fromCallback((final) => {
    // TODO: This async is required or test fail. Find root cause and remove
    async.waterfall([
      (cb) => {
        this.createRepoHookIfNotAlready(repoName, cb)
      }
    ], final)
  })
  .then(() => {
    return this.addDeployKeyIfNotAlreadyAsync(repoName)
  })
}

/**
 * @param  {String} fullRepoName (e.x. Runnable/api)
 * @return {String} name of org (e.x. runnable)
 */
Github.getOrgFromFullRepoName = function (fullRepoName) {
  const log = logger.log.child({
    fullRepoName,
    method: 'getOrgFromFullRepoName'
  })
  log.info('called')
  return fullRepoName.split('/')[0].toLowerCase()
}

/**
 * @param  {String} fullRepoName (e.x. Runnable/api)
 * @return {String} short name of repo (e.x. api)
 */
Github.getRepoShortNameFromFullRepoName = function (fullRepoName) {
  const log = logger.log.child({
    fullRepoName,
    method: 'getRepoShortNameFromFullRepoName'
  })
  log.info('called')
  return fullRepoName.split('/')[1]
}

Promise.promisifyAll(Github)
Promise.promisifyAll(Github.prototype)
