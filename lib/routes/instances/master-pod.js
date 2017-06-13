'use strict'

const express = require('express')
const app = module.exports = express()
const mw = require('dat-middleware')

const instances = require('mongooseware')(require('models/mongo/instance'))
const InstanceService = require('models/services/instance-service')
const PermissionService = require('models/services/permission-service')
const validations = require('middlewares/validations')

app.all('/instances/:id/masterPod',
  function (req, res, next) {
    InstanceService.findInstance(req.params.id)
    .tap(function (instance) {
      return PermissionService.ensureModelAccess(req.sessionUser, instance)
    })
    .tap(function (instance) {
      req.instance = instance
    })
    .asCallback(function (err) {
      next(err)
    })
  })

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
  mw.res.send(204))

app.delete('/instances/:id/masterPod',
  instances.model.update({ $set: { 'masterPod': false } }),
  instances.model.set('masterPod', false).sync('masterPoop'),
  instances.model.populateOwnerAndCreatedBy('sessionUser'),
  mw.res.send(204))
