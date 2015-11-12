'use strict'

var exec = require('child_process').exec
var assign = require('101/assign')
var async = require('async')
var createCount = require('callback-count')

var users = [
  // insert data here. DONT COMMIT KEYS TO GIT!!!!!!!!
]
var allOrgsToTokens = {}

async.series([
  getOrgTokensAndRestartUserInstances,
  restartOrgInstances
], function (err) {
  if (err) {
    console.error(err.stack)
  } else {
    console.log('SUCCESS!')
  }
})

function getOrgTokensAndRestartUserInstances (cb) {
  async.eachLimit(users, 1, function (user, cb) {
    var token = user.accounts.github.accessToken
    var username = user.accounts.github.username
    var opts = {
      env: assign(process.env, {
        RUNNABLE_GITHUB_TOKEN: token,
        NO_COOKIE: true
      })
    }
    var count = createCount(2, cb)
    // get tokens for orgs
    exec('runnable-cli orgs -q', opts, function (err, orgs) {
      console.log('GOT ORGS', username)
      if (err) { count.next(err) }
      orgs = orgs.split('\n')
      var orgsToTokens = orgs.reduce(function (orgsToTokens, orgName) {
        orgsToTokens[orgName] = token
        return orgsToTokens
      }, {})
      assign(allOrgsToTokens, orgsToTokens)
      count.next()
    })
    // restart user instances
    var queryCmd = [ 'runnable-cli', (username + ':instances'), '--state=running', '-q' ].join(' ')
    exec(queryCmd, opts, function (err, instances) {
      console.log('GOT USER INSTANCES', username)
      if (err) { count.next(err) }
      instances = instances.split('\n')
      async.eachLimit(instances, 1, function (instanceName, cb) {
        var restartCmd = [ 'runnable-cli', (username + ':instance:' + instanceName), 'restart' ]
          .join(' ')
        exec(restartCmd, opts, function (err, stdout) { // eslint-disable-line handle-callback-err
          // errors silently
          console.log(stdout)
          cb()
        })
      }, count.next)
    })
  }, cb)
}

function restartOrgInstances (cb) {
  async.eachLimit(Object.keys(allOrgsToTokens), 1, function (orgName, cb) {
    var token = allOrgsToTokens[orgName]
    var opts = {
      env: assign(process.env, {
        RUNNABLE_GITHUB_TOKEN: token,
        NO_COOKIE: true
      })
    }
    // restart user instances
    var queryCmd = [ 'runnable-cli', (orgName + ':instances'), '--state=running', '-q' ].join(' ')
    exec(queryCmd, opts, function (err, instances) {
      console.log('GOT ORG INSTANCES', orgName)
      if (err) { cb(err) }
      instances = instances.split('\n')
      async.eachLimit(instances, 1, function (instanceName, cb) {
        var restartCmd = [ 'runnable-cli', (orgName + ':instance:' + instanceName), 'restart' ]
          .join(' ')
        exec(restartCmd, opts, function (err, stdout) { // eslint-disable-line handle-callback-err
          // errors silently
          console.log(stdout)
          cb()
        })
      }, cb)
    })
  }, cb)
}

// / start and stop all orgs' instances```
