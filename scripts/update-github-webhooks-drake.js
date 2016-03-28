'use strict'
require('loadenv')()

var async = require('async')
var GitHub = require('models/apis/github')
var ContextVersion = require('models/mongo/context-version')
var find = require('101/find')
var hasKeypaths = require('101/has-keypaths')
var User = require('models/mongo/user')
var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)

var allErrors = []
var dry = !!find(process.argv, function (p) {
  var param = p.toLowerCase()
  return param === '--dry' || param === '-d'
})

function main () {
  var tasks = [
    function findAllRepos (cb) {
      ContextVersion.findAllRepos(cb)
    },
    findUsersForRepos,
    updateAllHookUrls
  ]
  async.waterfall(tasks, function finish (err) {
    console.log('DONE: err?', err)
    console.log('all errors', allErrors)
    process.exit()
  })
}

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

function updateAllHookUrls (repos, cb) {
  console.log('updateAllHookUrls', 'total repos num:', repos.length)
  async.mapLimit(repos, 50, function (repo, callback) {
    console.log('processing repo', repo)
    if (!repo.user) {
      console.log('user not found for the repo', repo)
      return callback()
    }
    // this will actually update hook (not just create if missing)
    updateOldRepoHookURL(
      repo.user.accounts.github.accessToken,
      repo._id,
      function (err) {
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
      }
    )
  }, cb)
}

function updateOldRepoHookURL (token, shortRepo, cb) {
  var github = new GitHub({ token: token })
  var oldHookUrl = process.env.FULL_API_DOMAIN + process.env.GITHUB_HOOK_PATH

  console.log('Searching for old webhooks', shortRepo)
  github._listRepoHooks(shortRepo, function (err, existingHooks) {
    if (err) {
      return cb(err)
    }

    // Find a hook with the old url
    var hook = find(existingHooks, hasKeypaths({
      'config.url': oldHookUrl,
      active: true,
      'events[0]': '*'
    }))

    // If the hook doesn't exist, skip this repository.
    if (!hook) {
      console.log('Old webhook not found, skipping.')
      return cb()
    }

    // Check to see if we are in dry mode before just updating a webhook
    if (dry) {
      console.log('[DRY] Not updating hook!')
      return cb()
    }

    // Update the hook with the new github webhook url
    console.log('Updating webhook')
    github._updateRepoHook(hook.id, shortRepo, function (err) {
      if (err) {
        return cb(err)
      }
      cb(null)
    })
  })
}

main()
