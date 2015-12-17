/*
* Before running this script, make sure your development DB has the seeded context
* versions, as provided by scripts/seed-version.js:
* `NODE_ENV=development NODE_PATH=./lib node scripts/seed-version.js`
*
* To run this script is very similar to seed-version:
* `NODE_ENV=development NODE_PATH=./lib node scripts/seed-instance.js`
*
* If you want to actually own these things that are created, change out the
* token used in the githubLogin function below to your Github Auth token
*/

'use strict'

// a runnable 0.2.1 script

var async = require('async')
var Runnable = require('runnable')
var user = new Runnable('api.runnable.io')
var uuid = require('uuid')

var ctx = {}

async.series([
  // TIP:
  // generate new token here: https://github.com/settings/applications
  // w/ permissions: repo, user, write:repo_hook
  function (cb) { ctx.user = user.githubLogin(process.env.GH_TOKEN || 'f914c65e30f6519cfb4d10d0aa81e235dd9b3652', cb) },
  function (cb) { ctx.sourceContexts = ctx.user.fetchContexts({isSource: true}, cb) },
  function (cb) { ctx.sourceVersions = ctx.sourceContexts.models[0].fetchVersions({}, cb) },
  function (cb) { ctx.context = ctx.user.createContext({name: uuid(), owner: {github: 2335750}}, cb) },
  function (cb) { ctx.build = ctx.user.createBuild({owner: {github: 2335750}}, cb) },
  function (cb) {
    ctx.contextVersion = ctx.context.createVersion({
      qs: {
        toBuild: ctx.build.id()
      }
    }, cb)
  },
  function (cb) {
    var icv = ctx.sourceVersions.models[0].json().infraCodeVersion
    ctx.contextVersion.copyFilesFromSource(icv, cb)
  },
  function (cb) { ctx.build.build({ message: 'seed instance script' }, cb) },
  function (cb) {
    async.whilst(
      function () {
        return ctx.build &&
        !(ctx.build.json().completed || ctx.build.json().failed)
      },
      function (cb) { ctx.build.fetch(cb) },
      cb)
  },
  function (cb) {
    ctx.instance = ctx.user.createInstance({
      json: {
        build: ctx.build.id(),
        name: uuid(),
        owner: {github: 2335750}
      }
    }, cb)
  }
], function (err) {
  if (err) {
    console.error(err)
    process.exit(1)
  } else {
    console.log('done')
  }
})
