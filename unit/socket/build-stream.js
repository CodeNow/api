'use strict'

const BuildStream = require('socket/build-stream').BuildStream
const Code = require('code')
const commonS3 = require('socket/common-s3')
const commonStream = require('socket/common-stream')
const ContextVersionService = require('models/services/context-version-service')
const EventEmitter = require('events').EventEmitter
const expect = Code.expect
const Lab = require('lab')
const objectId = require('objectid')
const path = require('path')
const PermissionService = require('models/services/permission-service')
const Promise = require('bluebird')
const sinon = require('sinon')
const util = require('util')
require('sinon-as-promised')(Promise)

const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const moduleName = path.relative(process.cwd(), __filename)

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

const id = '507f1f77bcf86cd799439011'
const data = {
  id: '507f1f77bcf86cd799439011',
  streamId: 17
}

let ctx = {}
let error

describe('build stream: ' + moduleName, function () {
  beforeEach(function (done) {
    ctx = {}
    ctx.sessionUser = {
      github: 123
    }
    const socket = {
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

  describe('when the build is running', () => {
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
          sinon.assert.calledOnce(commonStream.pipeLogsToClient)
          sinon.assert.calledWith(commonStream.pipeLogsToClient, sinon.match.any, 'api.socket.build-stream', sinon.match.any, ctx.cv.build.dockerContainer, { parseJSON: true })
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

  describe('when the build is finished', () => {
    beforeEach((done) => {
      ctx.cv = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        build: {
          completed: Date.now(),
          dockerContainer: 324342342342
        },
        writeLogsToPrimusStream: sinon.spy()
      }
      ContextVersionService.findContextVersion.resolves(ctx.cv)

      sinon.stub(commonS3, 'pipeLogsToClient').resolves({})
      commonStream.pipeLogsToClient.resolves({})
      ctx.buildStream.socket.substream = sinon.spy(function () {
        return new ClientStream()
      })
      done()
    })

    afterEach((done) => {
      commonS3.pipeLogsToClient.restore()
      done()
    })

    it('should stream logs from s3', (done) => {
      ctx.buildStream.handleStream().asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(commonS3.pipeLogsToClient)
        sinon.assert.calledWith(commonS3.pipeLogsToClient, sinon.match.any, ctx.cv.build.dockerContainer)
        sinon.assert.notCalled(commonStream.pipeLogsToClient)
        done()
      })
    })

    describe('when s3 does not have the file', () => {
      beforeEach((done) => {
        commonS3.pipeLogsToClient.rejects({
          code: 'NoSuchKey'
        })
        done()
      })
      it('should stream logs from the dock directly', (done) => {
        ctx.buildStream.handleStream().asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(commonS3.pipeLogsToClient)
          sinon.assert.calledWith(commonS3.pipeLogsToClient, sinon.match.any, ctx.cv.build.dockerContainer)
          sinon.assert.calledOnce(commonStream.pipeLogsToClient)
          sinon.assert.calledWith(commonStream.pipeLogsToClient, sinon.match.any, 'api.socket.build-stream', sinon.match.any, ctx.cv.build.dockerContainer, { parseJSON: true })
          done()
        })
      })
    })
  })
})
