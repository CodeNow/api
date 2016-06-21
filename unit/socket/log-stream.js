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
var Docker = require('models/apis/docker')
var EventEmitter = require('events').EventEmitter
var util = require('util')

var logStream = require('socket/log-stream')
var Instance = require('models/mongo/instance')

var Promise = require('bluebird')
var commonStream = require('socket/common-stream')

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

describe('log stream: ' + moduleName, function () {
  beforeEach(function (done) {
    error = new Error('not owner')
    rejectionPromise = Promise.reject(error)
    rejectionPromise.suppressUnhandledRejections()
    done()
  })

  describe('Check verification flow', function () {
    beforeEach(function (done) {
      ctx.sessionUser = {
        github: 123
      }
      ctx.socket = {
        id: 4,
        request: {
          sessionUser: ctx.sessionUser
        },
        write: sinon.spy(),
        substream: sinon.stub().returns({
          on: sinon.spy(),
          setEncoding: sinon.spy()
        })
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
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      commonStream.checkOwnership.restore()
      done()
    })

    describe('Faliures', function () {
      describe('Instance fetch failures', function () {
        beforeEach(function (done) {
          sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
          done()
        })
        it('should do nothing if the instance fetch returns nothing', function (done) {
          sinon.stub(Instance, 'findOne').yields()
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
          sinon.stub(Instance, 'findOne').yields(error)
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
        beforeEach(function (done) {
          sinon.stub(Instance, 'findOne').yields(null, ctx.instance)
          done()
        })
        it('should do nothing if the args are invalid', function (done) {
          sinon.stub(commonStream, 'checkOwnership').returns(rejectionPromise)
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
          sinon.stub(commonStream, 'checkOwnership').returns(rejectionPromise)
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
      beforeEach(function (done) {
        sinon.stub(Instance, 'findOne').yields(null, ctx.instance)
        sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
        sinon.stub(Docker.prototype, 'getLogsAndRetryOnTimeout').yields(null, {
          on: sinon.spy(),
          setEncoding: sinon.spy()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getLogsAndRetryOnTimeout.restore()
        done()
      })
      it('should allow logs when check ownership passes', function (done) {
        logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
          .then(function () {
            sinon.assert.calledOnce(commonStream.checkOwnership)
            sinon.assert.calledWith(commonStream.checkOwnership, ctx.sessionUser, ctx.instance)
            sinon.assert.calledOnce(ctx.socket.substream)
            sinon.assert.calledWith(ctx.socket.substream, ctx.data.containerId)
            sinon.assert.calledOnce(Docker.prototype.getLogsAndRetryOnTimeout)
            sinon.assert.calledWith(
              Docker.prototype.getLogsAndRetryOnTimeout,
              ctx.data.containerId,
              100,
              sinon.match.func
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
            sinon.assert.calledOnce(Docker.prototype.getLogsAndRetryOnTimeout)
            sinon.assert.calledWith(
              Docker.prototype.getLogsAndRetryOnTimeout,
              ctx.data.containerId,
              2000,
              sinon.match.func
            )
            done()
          })
          .catch(done)
      })
    })
  })
})
