/**
 * @module lib/models/mongo/user
 */
'use strict'

/**
 * Users are going to represent both individual users and Groups as well.
 * Groups will not be allowed to log in, however they will be owned by Users
 * @module models/mongo/user
 */

// TODO: clean this file up
var find = require('101/find')
var findIndex = require('101/find-index')
var hasProps = require('101/has-properties')
var isFunction = require('101/is-function')
var isObject = require('101/is-object')
var keypather = require('keypather')()
var last = require('101/last')
var mongoose = require('mongoose')
var async = require('async')
var Boom = require('dat-middleware').Boom

var Github = require('models/apis/github')
var UserSchema = require('models/mongo/schemas/user')
var logger = require('middlewares/logger')(__filename)

var Users
var log = logger.log

var publicFields = {
  _id: 1,
  name: 1,
  email: 1,
  created: 1,
  showEmail: 1,
  company: 1,
  accounts: 1,
  gravatar: 1
}

UserSchema.methods.returnJSON = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var json = this.toJSON()
  delete json.password
  cb(null, json)
}

// proxy callback to delete email if not public (showEmail != true)
function proxyCallbackToProtectEmail (args) {
  var cb = last(args)
  if (typeof cb === 'function') { // cb found
    args[args.length - 1] = function (err, user) {
      if (user) {
        if (Array.isArray(user)) {
          user.forEach(protectEmail)
        } else {
          protectEmail(user)
        }
      }
      cb(err, user)
    }
  }
  function protectEmail (user) {
    if (!user.showEmail) {
      user.email = undefined
    }
  }
}

// this will return an object that can be used as an owner. it will be either:
// 1) a user out of our database where the username from github query returns a github id we have
// 2) a bare object that contains the information for a github ORG represented by the username
UserSchema.statics.findOneByGithubUsername = function (username, sessionUserAccessToken, cb) {
  if (isFunction(sessionUserAccessToken)) {
    cb = sessionUserAccessToken
    sessionUserAccessToken = undefined
  }
  var self = this
  var github = new Github({ token: sessionUserAccessToken })
  github.getUserByUsername(username, function (err, githubData) {
    if (err) { cb(err) } else {
      var githubId = githubData.id
      if (githubData.type === 'Organization') {
        cb(null, { accounts: { github: githubData } })
      } else {
        self.findOne({ 'accounts.github.id': githubId }, cb)
      }
    }
  })
}

UserSchema.methods.findByGithubUsername = function (username, cb) {
  log.trace({
    tx: true,
    username: username
  }, 'publicFindByGithubUsername')
  var github = new Github()
  github.getUserByUsername(username, function (err, userData) {
    if (err) { cb(err) } else {
      var githubId = userData.id
      Users.find({ 'accounts.github.id': githubId }, cb)
    }
  })
}

/**
 * Find github user in mongo database, if not found query github API
 * for user data
 * @param {String} githubId
 * @param {Function} cb
 */
UserSchema.methods.findGithubUserByGithubId = function (githubId, cb) {
  log.info({
    tx: true,
    githubId: githubId
  }, 'findGithubUserByGithubId')
  var self = this
  Users.findByGithubId(githubId, function (err, user) {
    if (err) {
      return cb(err)
    } else if (!user) {
      self.findGithubOrgByGithubId(githubId, cb)
    } else {
      // FIXME: we should not be making requests with another user's token....
      var github = new Github({ token: user.accounts.github.accessToken })
      github.getAuthorizedUser(function (githubErr, githubUser) {
        if (githubErr) { return cb(githubErr) }
        cb(null, githubUser)
      })
    }
  })
}

UserSchema.methods.findGithubUsernameByGithubId = function (githubId, cb) {
  log.info({
    tx: true,
    githubId: githubId
  }, 'findGithubUsernameByGithubId')
  var github = new Github({ token: this.accounts.github.accessToken })
  github.getUserById(githubId, function (githubErr, githubUser) {
    if (githubErr) { return cb(githubErr) }
    cb(null, keypather.get(githubUser, 'login'))
  })
}

UserSchema.methods.findGithubOrgByGithubId = function (githubOrgId, cb) {
  log.info({
    tx: true,
    githubOrgId: githubOrgId
  }, 'findGithubOrgByGithubId')
  var github = new Github({ token: this.accounts.github.accessToken })
  github.getUserAuthorizedOrgs(function (err, orgs) {
    if (err) { return cb(err) }
    var org = find(orgs, hasProps({ id: githubOrgId }))
    if (org) { org.type = 'Organization' }
    cb(null, org)
  })
}

UserSchema.methods.findGithubOrgMembersByOrgName = function (githubOrgName, cb) {
  log.info({
    tx: true,
    githubOrgName: githubOrgName
  }, 'findGithubOrgByGithubId')
  var github = new Github({ token: this.accounts.github.accessToken })
  github.getOrgMembers(githubOrgName, function (err, members) {
    if (err) { return cb(err) }
    var memberHandler = function (member, cb) {
      return Users.publicFindOne({ 'accounts.github.id': member.id }, function (err, userData) {
        if (err) { return cb(err) }
        member.runnableUser = userData
        cb(null, member)
      })
    }
    async.map(members, memberHandler, cb)
  })
}

UserSchema.methods.findUsersByGithubOrgNameOrUsername = function (opts, cb) {
  if (!isObject(opts)) {
    cb(Boom.badRequest('Query argument must be an object', opts), null)
  } else if (opts.githubUsername && opts.githubOrgName) {
    cb(Boom.badRequest('Query object must contain only one of the following properties: `githubUsername`, `githubOrgName`', opts), null)
  } else if (opts.githubOrgName) {
    this.findGithubOrgMembersByOrgName(opts.githubOrgName, cb)
  } else if (opts.githubUsername) {
    this.findByGithubUsername(opts.githubUsername, cb)
  } else {
    cb(Boom.badRequest('Not enough parameters provided', opts), null)
  }
}

UserSchema.statics.publicFind = function () {
  var args = Array.prototype.slice.call(arguments)
  if (typeof args[1] === 'function') {
    args[2] = args[1] // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields
  proxyCallbackToProtectEmail(args)
  this.find.apply(this, args)
}

UserSchema.statics.publicFindOne = function () {
  var args = Array.prototype.slice.call(arguments)
  if (typeof args[1] === 'function') {
    args[2] = args[1] // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields
  proxyCallbackToProtectEmail(args)
  this.findOne.apply(this, args)
}

UserSchema.statics.publicFindById = function () {
  var args = Array.prototype.slice.call(arguments)
  if (typeof args[1] === 'function') {
    args[2] = args[1] // arg1 is cb so shift and insert fields
  }
  args[1] = publicFields
  proxyCallbackToProtectEmail(args)
  this.findById.apply(this, args)
}

UserSchema.statics.findByGithubId = function (id) {
  log.info({
    id: id,
    tx: true
  }, 'UserSchema.statics.findByGithubId')
  var args = Array.prototype.slice.call(arguments, 1)
  if (typeof id !== 'number') {
    id = Number(id)
  }
  args.unshift({ 'accounts.github.id': id })
  this.findOne.apply(this, args)
}

UserSchema.statics.updateByGithubId = function (id) {
  var args = Array.prototype.slice.call(arguments, 1)
  args.unshift({ 'accounts.github.id': id })
  this.update.apply(this, args)
}
/**
 * create mapping between hostname and instance to route to
 * @param  {string}   srcHostname    hostname which needs to be routed
 * @param  {string}   destInstanceId instance to route to
 * @param  {Function} cb          (err)
 */
UserSchema.methods.mapRoute = function (srcHostname, destInstanceId, cb) {
  var i = findIndex(this.routes, hasProps({ srcHostname: srcHostname }))
  if (~i) {
    // update if found
    this.routes[i] = {
      srcHostname: srcHostname,
      destInstanceId: destInstanceId
    }
  } else {
    // if not found just add
    this.routes.push({
      srcHostname: srcHostname,
      destInstanceId: destInstanceId
    })
  }

  Users.findByIdAndUpdate({
    _id: this._id
  }, {
    routes: this.routes
  }, cb)
}
/**
 * remove mapping from hostname
 * @param  {string}   srcHostname hostname to remove mapping from
 * @param  {Function} cb          (err)
 */
UserSchema.methods.removeRoute = function (srcHostname, cb) {
  Users.findByIdAndUpdate({
    _id: this._id
  }, {
    $pull: {
      routes: {
        srcHostname: srcHostname
      }
    }
  }, cb)
}

Users = module.exports = mongoose.model('Users', UserSchema)
