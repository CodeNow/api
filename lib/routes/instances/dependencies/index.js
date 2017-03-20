'use strict'

var express = require('express')
var app = module.exports = express()

var mw = require('dat-middleware')
var Boom = mw.Boom

var InstanceService = require('models/services/instance-service')
var PermissionService = require('models/services/permission-service')

app.all('/instances/:id/dependencies*',
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

var AWS_ALIAS_HOST = new RegExp('.' + process.env.AWS_ALIAS_HOST + '$', 'i')

app.get('/instances/:id/dependencies',
  mw.query('hostname').pick(),
  mw.query('hostname').require().then(
    mw.query('hostname').string(),
    mw.query().set('hostname', 'query.hostname.toLowerCase()')),
  function (req, res, next) {
    req.query.hostname = req.query.hostname.replace(AWS_ALIAS_HOST, '')
    req.instance.getDependenciesAsync(req.query)
      .then(function (deps) {
        res.send(200, deps)
      })
      .catch(function (err) {
        next(err)
      })
  })

var endsWithUserContentDomain = new RegExp('.+[.]' + process.env.USER_CONTENT_DOMAIN + '$', 'i')

app.put('/instances/:id/dependencies/:hostname',
  mw.body('instance').require().string(),
  mw.body('hostname')
    .require().string().matches(endsWithUserContentDomain),
  function (req, res, next) {
    return InstanceService.findInstance(req.body.instance)
      .then(function getDeps (newDep) {
        return req.instance.getDependenciesAsync({
          hostname: req.body.hostname
        })
          .tap(function checkDepFound (deps) {
            if (!deps.length) {
              throw Boom.notFound('existing dependency with hostname not found', {
                hostname: req.body.hostname,
                instance: req.instance._id.toString()
              })
            }
          })
          .then(function fetchExistingDep (deps) {
            if (deps.length) {
              return InstanceService.findInstance(deps[0]._id)
            }
          })
          .tap(function removeExistingDep (existingDep) {
            return req.instance.removeDependency(existingDep._id)
          })
          .tap(function addNewDependency () {
            return req.instance.addDependency(newDep)
          })
          .then(function emitUpdate () {
            return req.instance.emitInstanceUpdateAsync(req.sessionUser, 'update')
          })
          .then(function () {
            res.send(200, newDep)
          })
      })
      .catch(function (err) {
        next(err)
      })
  })
