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
var path = require('path')

var sinon = require('sinon')
var moduleName = path.relative(process.cwd(), __filename)
var me = require('middlewares/me')
var SocketServer = require('socket/socket-server')

describe('socket server: ' + moduleName, function () {
  var ctx
  var error
  describe('checkOwnership', function () {
    beforeEach(function (done) {
      error = new Error('not owner')
      ctx = {}
      ctx.sessionUser = {
        id: 'hello'
      }

      ctx.cvAttrs = {
        createdBy: {
          github: 123
        },
        owner: {
          github: 123
        },
        build: {
          log: 'hey',
          completed: Date.now()
        },
        writeLogsToPrimusStream: sinon.spy()
      }
      ctx.cv = {
        attrs: ctx.cvAttrs,
        toJSON: function () {
          return ctx.cvAttrs
        }
      }
      done()
    })
    afterEach(function (done) {
      me.isOwnerOf.restore()
      me.isModerator.restore()
      done()
    })
    it('should fail if both me checks fail', function (done) {
      var isOwnerOfSpy = sinon.stub().yields(error)
      var isModeratorSpy = sinon.stub().yields(error)
      sinon.stub(me, 'isOwnerOf').returns(isOwnerOfSpy)
      sinon.stub(me, 'isModerator').returns(isModeratorSpy)
      SocketServer.checkOwnership(ctx.sessionUser, ctx.cv)
        .catch(function (err) {
          expect(err, 'error').to.not.be.null
          expect(err.length, 'error length').to.equal(2)

          sinon.assert.calledOnce(me.isModerator)
          sinon.assert.calledOnce(isModeratorSpy)
          sinon.assert.calledWith(
            isModeratorSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )

          sinon.assert.calledOnce(me.isOwnerOf)
          sinon.assert.calledOnce(isOwnerOfSpy)
          sinon.assert.calledWith(
            isOwnerOfSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )
          done()
        })
        .catch(done)
    })
    it('should allow logs if the user owns the build', function (done) {
      var isOwnerOfSpy = sinon.stub().yields(null, true)
      var isModeratorSpy = sinon.stub().yields(error)
      sinon.stub(me, 'isOwnerOf').returns(isOwnerOfSpy)
      sinon.stub(me, 'isModerator').returns(isModeratorSpy)
      SocketServer.checkOwnership(ctx.sessionUser, ctx.cv)
        .then(function () {
          sinon.assert.calledOnce(me.isModerator)
          sinon.assert.calledOnce(isModeratorSpy)
          sinon.assert.calledWith(
            isModeratorSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )

          sinon.assert.calledOnce(me.isOwnerOf)
          sinon.assert.calledOnce(isOwnerOfSpy)
          sinon.assert.calledWith(
            isOwnerOfSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )
          done()
        })
        .catch(done)
    })
    it('should allow logs if the user is a moderator', function (done) {
      var isOwnerOfSpy = sinon.stub().yields(null, true)
      var isModeratorSpy = sinon.stub().yields(error)
      sinon.stub(me, 'isOwnerOf').returns(isOwnerOfSpy)
      sinon.stub(me, 'isModerator').returns(isModeratorSpy)
      SocketServer.checkOwnership(ctx.sessionUser, ctx.cv)
        .then(function () {
          sinon.assert.calledOnce(me.isModerator)
          sinon.assert.calledOnce(isModeratorSpy)
          sinon.assert.calledWith(
            isModeratorSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )

          sinon.assert.calledOnce(me.isOwnerOf)
          sinon.assert.calledOnce(isOwnerOfSpy)
          sinon.assert.calledWith(
            isOwnerOfSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )
          done()
        })
        .catch(done)
    })
    it('should allow logs if the user is a moderator and owner', function (done) {
      var isOwnerOfSpy = sinon.stub().yields(null, true)
      var isModeratorSpy = sinon.stub().yields(null, true)
      sinon.stub(me, 'isOwnerOf').returns(isOwnerOfSpy)
      sinon.stub(me, 'isModerator').returns(isModeratorSpy)
      SocketServer.checkOwnership(ctx.sessionUser, ctx.cv)
        .then(function () {
          sinon.assert.calledOnce(me.isModerator)
          sinon.assert.calledOnce(isModeratorSpy)
          sinon.assert.calledWith(
            isModeratorSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )

          sinon.assert.calledOnce(me.isOwnerOf)
          sinon.assert.calledOnce(isOwnerOfSpy)
          sinon.assert.calledWith(
            isOwnerOfSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )
          done()
        })
        .catch(done)
    })
    it('should also work on the attrs of a model, without toJSON', function (done) {
      var isOwnerOfSpy = sinon.stub().yields(null, true)
      var isModeratorSpy = sinon.stub().yields(null, true)
      sinon.stub(me, 'isOwnerOf').returns(isOwnerOfSpy)
      sinon.stub(me, 'isModerator').returns(isModeratorSpy)
      SocketServer.checkOwnership(ctx.sessionUser, ctx.cvAttrs)
        .then(function () {
          sinon.assert.calledOnce(me.isModerator)
          sinon.assert.calledOnce(isModeratorSpy)
          sinon.assert.calledWith(
            isModeratorSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )

          sinon.assert.calledOnce(me.isOwnerOf)
          sinon.assert.calledOnce(isOwnerOfSpy)
          sinon.assert.calledWith(
            isOwnerOfSpy,
            {sessionUser: ctx.sessionUser},
            sinon.match.object,
            sinon.match.func
          )
          done()
        })
        .catch(done)
    })
  })
})
