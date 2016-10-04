'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
// var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var sinon = require('sinon')
var EventEmitter = require('events').EventEmitter
var util = require('util')

var logStream = require('socket/log-stream')
var Instance = require('models/mongo/instance')

var Promise = require('bluebird')
require('sinon-as-promised')(Promise)
var commonStream = require('socket/common-stream')
var PermissionService = require('models/services/permission-service')

function ClientStream () {
  EventEmitter.call(this)
  this.jsonBuffer = []
  this.stream = true
}
util.inherits(ClientStream, EventEmitter)
ClientStream.prototype.write = function (data) {
  this.jsonBuffer.push(data)
}
ClientStream.prototype.end = function () { this.emit('end') }

var ctx = {}
var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
var error
var rejectionPromise
var writeStream
var substream

describe('log stream: ' + moduleName, function () {
  beforeEach(function (done) {
    error = new Error('not owner')
    rejectionPromise = Promise.reject(error)
    rejectionPromise.suppressUnhandledRejections()
    done()
  })

  describe('Check verification flow', function () {
    beforeEach(function (done) {
      substream = {
        on: sinon.spy(),
        setEncoding: sinon.spy()
      }
      ctx.sessionUser = {
        github: 123
      }
      ctx.socket = {
        id: 4,
        request: {
          sessionUser: ctx.sessionUser
        },
        write: sinon.spy(),
        substream: sinon.stub().returns(substream)
      }
      ctx.id = 4
      ctx.data = {
        id: 4,
        dockHost: 1233,
        containerId: 1231231232
      }
      ctx.instance = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        container: {
          dockerContainer: ctx.data.containerId
        }
      }
      writeStream = new ClientStream()
      done()
    })
    beforeEach(function (done) {
      sinon.stub(commonStream, 'pipeLogsToClient').resolves(writeStream)
      sinon.stub(PermissionService, 'ensureModelAccess').resolves(true)
      sinon.stub(Instance, 'findOneByContainerIdAsync').resolves(ctx.instance)
      done()
    })

    afterEach(function (done) {
      Instance.findOneByContainerIdAsync.restore()
      PermissionService.ensureModelAccess.restore()
      commonStream.pipeLogsToClient.restore()
      done()
    })

    describe('Failures', function () {
      describe('Instance fetch failures', function () {
        it('should do nothing if the instance fetch returns nothing', function (done) {
          Instance.findOneByContainerIdAsync.resolves()
          logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
            .catch(function (err) {
              expect(err.message).to.equal('Missing instance')
              sinon.assert.calledOnce(ctx.socket.write)
              sinon.assert.calledWith(ctx.socket.write, {
                id: ctx.socket.id,
                error: 'You don\'t have access to this stream',
                message: 'Missing instance'
              })
              done()
            })
            .catch(done)
        })

        it('should do nothing if the instance fetch returns an error', function (done) {
          Instance.findOneByContainerIdAsync.rejects(error)
          logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
            .catch(function (err) {
              expect(err.message).to.equal(error.message)
              sinon.assert.calledOnce(ctx.socket.write)
              sinon.assert.calledWith(ctx.socket.write, {
                id: ctx.socket.id,
                error: 'You don\'t have access to this stream',
                message: error.message
              })
              done()
            })
            .catch(done)
        })
      })

      describe('Other failures', function () {
        it('should do nothing if the args are invalid', function (done) {
          PermissionService.ensureModelAccess.rejects(error)
          logStream.logStreamHandler(ctx.socket, ctx.id, {})
            .catch(function (err) {
              expect(err.message).to.equal('dockHost and containerId are required')
              sinon.assert.calledOnce(ctx.socket.write)
              sinon.assert.calledWith(ctx.socket.write, {
                id: ctx.id,
                error: 'You don\'t have access to this stream',
                message: 'dockHost and containerId are required'
              })
              done()
            })
            .catch(done)
        })

        it('should do nothing if the ownership check fails', function (done) {
          PermissionService.ensureModelAccess.rejects(error)
          logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
            .catch(function (err) {
              expect(err).to.equal(error)
              sinon.assert.calledOnce(ctx.socket.write)
              sinon.assert.calledWith(ctx.socket.write, {
                id: ctx.socket.id,
                error: 'You don\'t have access to this stream',
                message: 'not owner'
              })
              done()
            })
            .catch(done)
        })
      })
    })
    describe('Success', function () {
      it('should allow logs when check ownership passes', function (done) {
        logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
          .then(function () {
            sinon.assert.calledOnce(PermissionService.ensureModelAccess)
            sinon.assert.calledWith(PermissionService.ensureModelAccess, ctx.sessionUser, ctx.instance)
            sinon.assert.calledOnce(ctx.socket.substream)
            sinon.assert.calledWith(ctx.socket.substream, ctx.data.containerId)
            sinon.assert.calledOnce(commonStream.pipeLogsToClient)
            sinon.assert.calledWith(
              commonStream.pipeLogsToClient,
              substream,
              ctx.data.containerId,
              {
                tailLimit: process.env.DOCKER_LOG_TAIL_LIMIT,
                baseDataName: 'api.socket.log'
              }
            )
            sinon.assert.calledOnce(ctx.socket.write)
            sinon.assert.calledWith(ctx.socket.write, {
              id: ctx.id,
              event: 'LOG_STREAM_CREATED',
              data: {
                substreamId: ctx.data.containerId
              }
            })
            done()
          })
          .catch(done)
      })

      it('should fetch different amounts for test containers', function (done) {
        ctx.instance.isTesting = true
        logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data, ctx.instance)
          .then(function () {
            sinon.assert.calledOnce(commonStream.pipeLogsToClient)
            sinon.assert.calledWith(
              commonStream.pipeLogsToClient,
              substream,
              ctx.data.containerId,
              {
                tailLimit: process.env.DOCKER_TEST_LOG_TAIL_LIMIT,
                baseDataName: 'api.socket.log'
              }
            )
            done()
          })
          .catch(done)
      })
    })
  })
})
