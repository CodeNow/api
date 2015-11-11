/**
 * This is a script which can be used to rebuild instances without cache
 * this will rebuild every instance which is found via query
 */
'use strict'
require('loadenv')()
var async = require('async')

var mongoose = require('mongoose')
mongoose.connect(process.env.MONGO)
var User = require('models/mongo/user.js')
var Instance = require('models/mongo/instance')

var Runnable = require('runnable')
var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
  requestDefaults: {
    headers: {
      'user-agent': 'rebuild-instances-script'
    }
  }
})

// all instances found with this query will be rebuild
// var query = { 'container.error.data.err.reason': 'runnable error please rebuild' }

// hung builds
var query = {
  container: { $exists: false },
  'contextVersion.build.completed': { $exists: true },
  'contextVersion.build.failed': false
}

runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, function (err0) {
  if (err0) {
    console.log('failed login', err0)
    throw err0
  }
  var c = 0
  Instance.find(query, function (err1, a) {
    // use me to do a single instance
    // a = [{ shortHash: 'e5wdne' }]
    if (err1) {
      console.log('find failed')
      throw err1
    }
    console.log('found', a.length)
    async.eachSeries(a, function (i, cb) {
      c++
      var instanceModel = runnableClient.newInstance(i.shortHash)
      instanceModel.fetch(function (err2) {
        if (err2) {
          console.log('failed fetch', err2, i.shortHash)
          return cb()
        }
        if (!instanceModel.attrs.createdBy.github) {
          console.log('no createdBy', i.shortHash)
          return cb()
        }
        User.findByGithubId(instanceModel.attrs.createdBy.github, function (err3, ud) {
          if (err3) {
            console.log('failed getting user', err3, ud, i.shortHash)
            return cb()
          }
          var runnableClient2 = new Runnable(process.env.FULL_API_DOMAIN, {
            requestDefaults: {
              headers: {
                'user-agent': 'rebuild-instances-script'
              }
            }
          })
          runnableClient2.githubLogin(ud.accounts.github.accessToken, function (err4) {
            if (err4) {
              console.log('error logging in', err4, i.shortHash)
              return cb()
            }
            instanceModel = runnableClient2.newInstance(i.shortHash)
            instanceModel.fetch(function (err5) {
              if (err5) {
                console.log('failed fetch 2', err5, i.shortHash)
                return cb()
              }
              instanceModel.build.deepCopy(function (err6, build) {
                if (err6) {
                  console.log('failed to deep copy', i.shortHash, err6)
                  return cb()
                }
                build = runnableClient.newBuild(build)
                build.build({
                  message: 'Manual build',
                  noCache: true
                }, function (err7, nbuild) {
                  if (err7) {
                    console.log('failed to build', i.shortHash, err7)
                    return cb()
                  }
                  instanceModel.update({
                    build: nbuild._id,
                    env: instanceModel.attrs.env
                  }, function (err8) {
                    // ignore errors for now
                    if (err8) {
                      console.log('failed to update', i.shortHash, err8)
                    } else {
                      console.log('done', i.shortHash, c, '/', a.length)
                    }
                    cb()
                  })
                })
              })
            })
          })
        })
      })
    }, console.log.bind(console, 'ALL DONE'))
  })
})
