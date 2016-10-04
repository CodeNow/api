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
var objectId = require('objectid')

var BuildStream = require('socket/build-stream').BuildStream
var ContextVersionService = require('models/services/context-version-service')
var PermissionService = require('models/services/permission-service')

var Promise = require('bluebird')
require('sinon-as-promised')(Promise)
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

var id = '507f1f77bcf86cd799439011'
var data = {
  id: '507f1f77bcf86cd799439011',
  streamId: 17
}
describe('build stream: ' + moduleName, function () {
  beforeEach(function (done) {
    ctx.sessionUser = {
      github: 123
    }
    var socket = {
      request: {
        sessionUser: ctx.sessionUser
      }
    }
    ctx.buildStream = new BuildStream(socket, id, data)

    ctx.cv = {
      createdBy: {
        github: 123
      },
      owner: {
        github: 123
      },
      build: {
        log: 'hey',
        completed: Date.now(),
        dockerContainer: 324342342342
      },
      writeLogsToPrimusStream: sinon.spy()
    }
    error = new Error('Invalid context version')
    ctx.commonStreamValidateStub = sinon.stub().throws(error)
    sinon.stub(PermissionService, 'ensureModelAccess').resolves(true)
    sinon.stub(commonStream, 'onValidateFailure').returns(ctx.commonStreamValidateStub)
    sinon.stub(ContextVersionService, 'findContextVersion').resolves(ctx.cv)
    sinon.stub(commonStream, 'pipeLogsToClient').returns()
    done()
  })
  afterEach(function (done) {
    ContextVersionService.findContextVersion.restore()
    PermissionService.ensureModelAccess.restore()
    commonStream.pipeLogsToClient.restore()
    commonStream.onValidateFailure.restore()
    done()
  })

  describe('handleStream', function () {
    it('should do nothing if the ownership check fails', function (done) {
      PermissionService.ensureModelAccess.rejects(error)
      ctx.commonStreamValidateStub.throws(error)
      ctx.buildStream.socket.substream = sinon.spy(function () {
        done(new Error('This shouldn\'t have happened'))
      })
      ctx.buildStream.handleStream().asCallback(function (err) {
        expect(err).to.equal(error)
        sinon.assert.calledOnce(ctx.commonStreamValidateStub)
        sinon.assert.calledWith(
          commonStream.onValidateFailure,
          sinon.match.string,
          sinon.match.object,
          sinon.match.any,
          sinon.match.object
        )
        sinon.assert.calledWith(ctx.commonStreamValidateStub, error)
        done()
      })
    })

    it('should allow logs when check ownership passes', function (done) {
      ctx.buildStream.socket.substream = sinon.spy(function () {
        return new ClientStream()
      })
      ctx.buildStream.handleStream().asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ctx.buildStream.socket.substream)
        sinon.assert.calledOnce(ctx.cv.writeLogsToPrimusStream)
        sinon.assert.calledOnce(PermissionService.ensureModelAccess)
        sinon.assert.calledWith(PermissionService.ensureModelAccess, ctx.sessionUser, ctx.cv)
        done()
      })
    })

    it('should use the correct query to find the context version', function (done) {
      ctx.buildStream.socket.substream = sinon.spy(function () {
        return new ClientStream()
      })
      ctx.buildStream.handleStream().asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersionService.findContextVersion)
        sinon.assert.calledWith(ContextVersionService.findContextVersion)
        var cvId = ContextVersionService.findContextVersion.firstCall.args[0]
        expect(cvId).to.exist()
        expect(objectId.isValid(cvId)).to.be.true()
        expect(cvId).to.be.an.object()
        expect(cvId.toString()).to.equal(ctx.buildStream.data.id)
        done()
      })
    })
  })

  describe('handleStream verification', function () {
    beforeEach(function (done) {
      ctx.commonStreamValidateStub.throws(error)
      done()
    })

    it('should do nothing if the verification fails', function (done) {
      ctx.buildStream.handleStream().asCallback(function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('Invalid context version')
        sinon.assert.calledOnce(ctx.commonStreamValidateStub)
        sinon.assert.calledWith(
          commonStream.onValidateFailure,
          sinon.match.string,
          sinon.match.object,
          sinon.match.any,
          sinon.match.object
        )
        sinon.assert.calledWith(ctx.commonStreamValidateStub, err)
        done()
      })
    })
  })
})
