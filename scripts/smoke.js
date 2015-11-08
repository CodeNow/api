'use strict'

var async = require('async')
var Runnable = require('runnable')
var user = new Runnable('localhost:3030')
var uuid = require('uuid')
// var createCount = require('callback-count')
var find = require('101/find')
var hasKeypaths = require('101/has-keypaths')

var projectName = uuid()
var ctx = {}

async.series([
  function (cb) { ctx.user = user.githubLogin('fc85cf8ce7d69de48cecd29a626dd8cfa6841a49', cb) },
  function (cb) { ctx.sourceContexts = ctx.user.fetchContexts({isSource: true}, cb) },
  function (cb) { ctx.sourceVersions = ctx.sourceContexts.models[0].fetchVersions({}, cb) },
  function (cb) { ctx.project = ctx.user.createProject({ name: projectName }, cb) },
  function (cb) {
    ctx.env = ctx.project.newEnvironment(ctx.project.json().defaultEnvironment)
    cb()
  },
  function (cb) { ctx.build = ctx.env.createBuild({}, cb) },
  function (cb) { ctx.context = ctx.user.createContext({ name: projectName }, cb) },
  function (cb) {
    ctx.contextVersion = ctx.context.createVersion({
      qs: {
        toBuild: ctx.build.id()
      },
      json: {
        environment: ctx.env.id()
      }
    }, cb)
  },
  function (cb) { ctx.contextVersion.addGithubRepo('bkendall/hairy-bear', cb) },
  function (cb) {
    var icv = ctx.sourceVersions.models[0].json().infraCodeVersion
    ctx.contextVersion.copyFilesFromSource(icv, cb)
  },
  function (cb) {
    ctx.files = ctx.contextVersion.rootDir.contents
    ctx.files.fetch({path: '/'}, function (err) {
      if (err) { return cb(err) }
      ctx.dockerfile = find(ctx.files.models, hasKeypaths({'id()': '/Dockerfile'}))
      cb()
    })
  },
  function (cb) {
    ctx.dockerfile.update({
      json: {
        body: 'FROM dockerfile/nodejs\nADD ./hairy-bear /hb\n' +
          'WORKDIR /hb\nEXPOSE 80\nCMD ["node", "server.js"]'
      }
    }, cb)
  },
  function (cb) { ctx.build.build({ message: uuid() }, cb) },
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
        name: uuid()
      }
    }, cb)
  }
], function (err) {
  if (err) {
    console.error('err', err, err.stack)
    process.exit(1)
  } else {
    console.log('done!')
    process.exit(0)
  }
})
