'use strict'

var express = require('express')
var app = module.exports = express()
var flow = require('middleware-flow')
var mw = require('dat-middleware')
var keypather = require('keypather')()

var Instance = require('models/mongo/instance')
var instances = require('mongooseware')(require('models/mongo/instance'))
var checkFound = require('middlewares/check-found')
var me = require('middlewares/me')
var ownerIsHelloRunnable = require('middlewares/owner-is-hello-runnable')
var validations = require('middlewares/validations')
var hosts = require('middlewarize')(require('models/redis/hosts'))

app.all('/instances/:id/masterPod',
  instances.findOneByShortHash('params.id'),
  checkFound('instance'),
  flow.or(
    me.isOwnerOf('instance'),
    ownerIsHelloRunnable('instance'),
    me.isModerator))

app.get('/instances/:id/masterPod',
  mw.req('instance.masterPod').validate(validations.equals(true)).then(
    mw.res.send(204)
  ).else(
    mw.res.send(404)
  ))

app.put('/instances/:index/masterPod',
  mw.req('body')
    .require()
    .validate(validations.isPopulatedArray)
    .validate(validations.isArrayOf('boolean')),
  // extra check, but shouldn't get hit given api-client's logic
  mw.req('body[0]').require().validate(validations.equals(true)),
  instances.model.update({ $set: { 'masterPod': 'body[0]' } }),
  instances.model.set('masterPod', 'body[0]').sync('masterPoop'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  hosts.new(),
  hosts.model.upsertHostsForInstance('instance.owner.username', 'instance', 'cb'),
  mw.res.send(204))

app.delete('/instances/:id/masterPod',
  hosts.new(),
  instances.model.update({ $set: { 'masterPod': false } }),
  instances.model.set('masterPod', false).sync('masterPoop'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  mw.req('instance.container.dockerContainer').require()
    .then(
      hosts.model.upsertHostsForInstance('instance.owner.username', 'instance', 'cb')
  ).else(
    function (req, res, next) {
      var branch = Instance.getMainBranchName(req.instance)
      var naviEntry = {
        ownerUsername: keypather.get(req, 'instance.owner.username'),
        ownerGithub: keypather.get(req, 'instance.owner.github'),
        branch: branch,
        masterPod: keypather.get(req, 'instance.masterPod'),
        instanceName: keypather.get(req, 'instance.name'),
        shortHash: keypather.get(req, 'instance.shortHash')
      }
      req.naviLightEntry = naviEntry
      next()
    },
    hosts.model.removeHostsForInstance('naviLightEntry', 'instance.container.ports', 'cb')
  ),
  mw.res.send(204))
