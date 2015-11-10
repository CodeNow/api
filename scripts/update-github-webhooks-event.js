'use strict'
require('loadenv')()

var async = require('async')
var GitHub = require('models/apis/github')
var ContextVersion = require('models/mongo/context-version')
var User = require('models/mongo/user')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)

function findAllRepos (cb) {
  ContextVersion.findAllRepos(cb)
}

var allErrors = []

function findUser (users, cb) {
  var user
  var count = 0
  async.whilst(
    function () { return count < users.length },
    function (callback) {
      var userId = users[count]
      User.findByGithubId(userId, function (err, gitHubUser) {
        if (err) { return cb(err) }
        count++
        if (gitHubUser) {
          // force finish
          user = gitHubUser
          count = users.length
        }
        callback()
      })
    },
    function (err) {
      if (err) {
        return cb(err)
      }
      cb(null, user)
    }
  )
}

function findUsersForRepos (repos, cb) {
  console.log('findUsersForRepos', 'total repos num:', repos.length)
  async.map(repos, function (repo, callback) {
    findUser(repo.creators, function (err, user) {
      if (err) { return callback(err) }
      repo.user = user
      callback(null, repo)
    })
  }, cb)
}

function updateHooksEvents (repos, cb) {
  console.log('updateHooksEvents', 'total repos num:', repos.length)
  async.mapLimit(repos, 50, function (repo, callback) {
    console.log('processing repo', repo)
    if (!repo.user) {
      console.log('user not found for the repo', repo)
      return callback()
    }
    var github = new GitHub({token: repo.user.accounts.github.accessToken})
    // this will actually update hook (not just create if missing)
    github.createRepoHookIfNotAlready(repo._id, function (err) {
      if (err) {
        allErrors.push(err)
        if (err.output.statusCode === 404) {
          console.log('repos not found. just skip it', repo)
          callback(null)
        } else if (err.output.statusCode === 502) {
          console.log('access token removed. just skip it', repo)
          callback(null)
        } else {
          callback(err)
        }
      } else {
        callback(null)
      }
    })
  }, cb)
}

function finish (err) {
  console.log('DONE: err?', err)
  console.log('all errors', allErrors)
  process.exit()
}
async.waterfall([
  findAllRepos,
  findUsersForRepos,
  updateHooksEvents
], finish)
