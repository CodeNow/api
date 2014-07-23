'use strict';

var async = require('async');
var Runnable = require('runnable');
var user = new Runnable('localhost:3030');
var uuid = require('uuid');
var createCount = require('callback-count');

var projectName = uuid();
var ctx = {};

async.series([
  function (cb) { ctx.user = user.githubLogin('fc85cf8ce7d69de48cecd29a626dd8cfa6841a49', cb); },
  function (cb) { ctx.sourceContexts = ctx.user.fetchContexts({isSource: true}, cb); },
  function (cb) { ctx.sourceVersions = ctx.sourceContexts.models[0].fetchVersions({}, cb); },
  function (cb) { ctx.project = ctx.user.createProject({ name: projectName }, cb); },
  function (cb) {
    ctx.env = ctx.project.newEnvironment(ctx.project.json().defaultEnvironment);
    cb();
  },
  function (cb) { ctx.build = ctx.env.createBuild({}, cb); },
  function (cb) { ctx.context = ctx.user.fetchContext(ctx.build.json().contexts[0], cb); },
  function (cb) { ctx.contextVersion = ctx.context.createVersion({
    qs: {
      fromSource: ctx.sourceVersions.models[0].json().infraCodeVersion,
      toBuild: ctx.build.id()
    },
    json: {
      environment: ctx.env.id(),
    } }, cb);
  },
  function (cb) { ctx.contextVersion.addGithubRepo('bkendall/qwirkle', cb); },
  function (cb) {
    ctx.files = ctx.contextVersion.fetchFiles({path: '/', name: 'Dockerfile'}, cb);
  },
  function (cb) {
    ctx.dockerfile = ctx.files.models[0];
    ctx.dockerfile.update({ json: {
      body: 'FROM dockerfile/nodejs\nADD ./qwirkle /data\nCMD ls -l /data/qwirkle'
    }}, cb);
  },
  function (cb) { ctx.build.build({ message: uuid() }, cb); },
  function (cb) {
    async.whilst(
      function () {
        return ctx.build &&
          !(ctx.build.json().completed || ctx.build.json().erroredContextVersions.length);
      },
      function (cb) { ctx.build.fetch(cb); },
      cb);
  },
  function (cb) {
    var count = createCount(2, cb);
    ctx.build.fetch(count.next);
    ctx.contextVersion.fetch(count.next);
  }
], function (err) {
  if (err) {
    console.error('err', err);
    process.exit(1);
  } else {
    console.log('done!');
    console.log(ctx.build.json());
    console.log(ctx.contextVersion.json());
    process.exit(0);
  }
});
