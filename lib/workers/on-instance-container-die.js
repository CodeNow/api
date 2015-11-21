/**
 * @module lib/workers/on-instance-container-die
 */
'use strict'

require('loadenv')()
var domain = require('domain')
var error = require('error')
var put = require('101/put')
var util = require('util')
var uuid = require('uuid')

var BaseWorker = require('workers/base-worker')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var log = require('middlewares/logger')(__filename).log

module.exports = OnInstanceContainerDie

module.exports.worker = function (data, done) {
  var logData = put({
    tx: true,
    elapsedTimeSeconds: new Date(),
    uuid: uuid.v4(),
    data: data
  }, data)
  log.info(logData, 'OnInstanceContainerDie module.exports.worker')
  var workerDomain = domain.create()
  workerDomain.runnableData = BaseWorker.getRunnableData()
  workerDomain.on('error', function (err) {
    log.fatal(put({
      err: err
    }, logData), 'on-instance-container-die domain error')
    error.workerErrorHandler(err, data)
    // ack job and clear to prevent loop
    done()
  })
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, logData), 'hermes.subscribe on-instance-container-die start')
    var worker = new OnInstanceContainerDie(data)
    worker.handle(done)
  })
}

function OnInstanceContainerDie () {
  log.info('OnInstanceContainerDie constructor')
  BaseWorker.apply(this, arguments)
}

util.inherits(OnInstanceContainerDie, BaseWorker)

OnInstanceContainerDie.prototype.handle = function (done) {
  var self = this
  log.info(self.logData, 'OnInstanceContainerDie.prototype.handle')
  var containerId = this.data.id
  var inspect = this.data.inspectData
  Instance.findOneByContainerId(containerId, function (err, instance) {
    if (err) {
      log.fatal(put({
        err: err,
        containerId: containerId
      }, self.logData), 'handle: instance.findOneByContainerId error')
      return done(err)
    } else if (!instance) {
      log.warn(self.logData, 'handle: instance.findOneByContainerId !instance')
      return done(new Error('Instance with container not found'))
    }
    log.info(self.logData, 'handle: instance.findOneByContainerId success')
    instance.modifyContainerInspect(containerId, inspect, function (err, updatedInstance) {
      if (err) {
        log.error(put({
          err: err,
          containerId: containerId,
          inspect: inspect
        }, self.logData), 'handle: findOneByContainerId modifyContainerInspect error')
        return done(err)
      } else if (!updatedInstance) {
        log.warn(put({
          err: err,
          containerId: containerId,
          inspect: inspect
        }, self.logData), 'handle: findOneByContainerId modifyContainerInspect !updatedInstance')
        return done(new Error('Instance with container not found'))
      }
      log.info(self.logData, 'handle: findOneByContainerId modifyContainerInspect success')
      User.findByGithubId(instance.createdBy.github, function (err, user) {
        if (err) {
          log.error(put({
            err: err
          }, self.logData), 'handle: findOneByContainerId modifyContainerInspect ' +
            'User.findByGithubId error')
          return done(err)
        }
        updatedInstance.emitInstanceUpdate(user, 'container_inspect', done)
      })
    })
  })
}
