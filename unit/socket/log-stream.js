'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
// const after = lab.after
const afterEach = lab.afterEach
const Code = require('code')
const expect = Code.expect

const sinon = require('sinon')
const EventEmitter = require('events').EventEmitter
const util = require('util')

const logStream = require('socket/log-stream')
const Instance = require('models/mongo/instance')

const clioClient = require('@runnable/clio-client')
const Promise = require('bluebird')
require('sinon-as-promised')(Promise)
const commonStream = require('socket/common-stream')
const commonS3 = require('socket/common-s3')
const PermissionService = require('models/services/permission-service')

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

  beforeEach((done) => {
    sinon.stub(clioClient, 'fetchContainerInstance').resolves()
    sinon.stub(Instance, 'findByIdAsync').resolves()
    done()
  })

  afterEach((done) => {
    clioClient.fetchContainerInstance.restore()
    Instance.findByIdAsync.restore()
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
          dockerContainer: ctx.data.containerId,
          inspect: {
            State: {
              Running: true
            }
          }
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
              'api.socket.log',
              sinon.match.object,
              ctx.data.containerId,
              {
                tailLimit: process.env.DOCKER_LOG_TAIL_LIMIT
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
              'api.socket.log',
              sinon.match.object,
              ctx.data.containerId,
              {
                tailLimit: process.env.DOCKER_TEST_LOG_TAIL_LIMIT
              }
            )
            done()
          })
          .catch(done)
      })

      describe('When container is stopped', () => {
        beforeEach((done) => {
          ctx.instance.container.inspect.State.Running = false
          sinon.stub(commonS3, 'pipeLogsToClient').resolves({})
          done()
        })
        afterEach((done) => {
          commonS3.pipeLogsToClient.restore()
          done()
        })
        describe('file exists in s3', () => {
          it('should stream logs from s3 file', (done) => {
            logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
              .then(() => {
                sinon.assert.notCalled(commonStream.pipeLogsToClient)
                sinon.assert.calledOnce(commonS3.pipeLogsToClient)
                sinon.assert.calledWith(
                  commonS3.pipeLogsToClient,
                  substream,
                  ctx.data.containerId
                )
              })
              .asCallback(done)
          })
        })
        describe('and file does not exist in s3', () => {
          beforeEach((done) => {
            commonS3.pipeLogsToClient.rejects({code: 'NoSuchKey'})
            done()
          })
          it('should stream logs from docker file', (done) => {
            logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
              .then(() => {
                sinon.assert.calledOnce(commonS3.pipeLogsToClient)
                sinon.assert.calledWith(
                  commonS3.pipeLogsToClient,
                  substream,
                  ctx.data.containerId
                )
                sinon.assert.calledOnce(commonStream.pipeLogsToClient)
                sinon.assert.calledWith(
                  commonStream.pipeLogsToClient,
                  substream,
                  'api.socket.log',
                  sinon.match.object,
                  ctx.data.containerId,
                  {
                    tailLimit: process.env.DOCKER_LOG_TAIL_LIMIT
                  }
                )
              })
              .asCallback(done)
          })
        })
      })

      describe('when fetching old instance', () => {
        const instanceId = 1234
        const oldContainerId = 'deadbeef'

        beforeEach((done) => {
          Instance.findOneByContainerIdAsync.resolves()
          clioClient.fetchContainerInstance.resolves(instanceId)
          Instance.findByIdAsync.resolves(ctx.instance)
          ctx.instance.container.inspect.State.Running = false
          sinon.stub(commonS3, 'pipeLogsToClient').resolves({})
          ctx.data.containerId = oldContainerId
          done()
        })
        afterEach((done) => {
          commonS3.pipeLogsToClient.restore()
          done()
        })
        it('should load logs for instance', (done) => {
          logStream.logStreamHandler(ctx.socket, ctx.id, ctx.data)
            .then(() => {
              sinon.assert.calledOnce(clioClient.fetchContainerInstance)
              sinon.assert.calledWith(clioClient.fetchContainerInstance, oldContainerId)
              sinon.assert.calledOnce(Instance.findByIdAsync)
              sinon.assert.calledWith(Instance.findByIdAsync, instanceId)
              sinon.assert.notCalled(commonStream.pipeLogsToClient)
              sinon.assert.calledOnce(commonS3.pipeLogsToClient)
              sinon.assert.calledWith(
                commonS3.pipeLogsToClient,
                substream,
                ctx.data.containerId
              )
            })
            .asCallback(done)
        })
      })
    })
  })
})
