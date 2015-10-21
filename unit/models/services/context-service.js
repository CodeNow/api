'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = require('code').expect
var it = lab.it

// external
var keypather = require('keypather')()
var mongoose = require('mongoose')
var sinon = require('sinon')

// internal
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var Runnable = require('models/apis/runnable')

// internal (being tested)
var ContextService = require('models/services/context-service')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('ContextService: ' + moduleName, function () {
  var ctx = {}

  beforeEach(function (done) {
    sinon.stub(Context.prototype, 'save').yieldsAsync()
    sinon.stub(ContextVersion, 'createDeepCopy').yieldsAsync()
    sinon.stub(ContextVersion, 'findOne').yieldsAsync()
    sinon.stub(Runnable.prototype, 'copyVersionIcvFiles').yieldsAsync()
    done()
  })

  afterEach(function (done) {
    Context.prototype.save.restore()
    ContextVersion.createDeepCopy.restore()
    ContextVersion.findOne.restore()
    Runnable.prototype.copyVersionIcvFiles.restore()
    done()
  })

  describe('.handleVersionDeepCopy', function () {
    beforeEach(function (done) {
      ctx.mockContextVersion = {
        infraCodeVersion: 'pizza',
        owner: { github: 1234 }
      }
      ctx.mockContext = {
        owner: { github: 1234 }
      }
      ctx.mockUser = {
        accounts: {
          github: { id: 1234 }
        }
      }
      done()
    })

    describe('a CV owned by hellorunnable', function () {
      beforeEach(function (done) {
        ctx.returnedMockedContextVersion = {
          _id: 'deadb33f',
          owner: { github: -1 },
          // createDeepCopy sets the correct createdBy
          createdBy: { github: 1234 }
        }
        ctx.mockContextVersion.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID
        ContextVersion.createDeepCopy.yieldsAsync(null, ctx.returnedMockedContextVersion)
        ctx.mockContext.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID
        sinon.stub(ContextVersion, 'findOneAndUpdate', function (query, update, cb) {
          // a pho-update
          process.nextTick(function () {
            Object.keys(update.$set).forEach(function (keypath) {
              keypather.set(ctx.returnedMockedContextVersion, keypath, update.$set[keypath])
            })
            cb(null, ctx.returnedMockedContextVersion)
          })
        })
        done()
      })

      afterEach(function (done) {
        ContextVersion.findOneAndUpdate.restore()
        done()
      })

      it('should allow the body of the request to override the owner', function (done) {
        var opts = {
          owner: { github: 88 }
        }
        ContextVersion.findOne.yieldsAsync(null, ctx.returnedMockedContextVersion)
        ContextService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser,
          opts,
          function (err, contextVersion) {
            if (err) { return done(err) }
            // we have to do a find one and update to update the db
            sinon.assert.calledWithExactly(
              ContextVersion.findOneAndUpdate,
              { _id: ctx.returnedMockedContextVersion._id },
              {
                $set: {
                  context: sinon.match.instanceOf(mongoose.Types.ObjectId),
                  'owner.github': opts.owner.github
                }
              },
              sinon.match.func
            )
            // and since find one and update doesn't return an updated, document,
            // we get to ask the database again for the documnet
            sinon.assert.calledWithExactly(
              ContextVersion.findOne,
              { _id: ctx.returnedMockedContextVersion._id },
              sinon.match.func
            )
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion)
            expect(contextVersion.owner.github).to.equal(opts.owner.github)
            // createdBy should _not_ be overridden
            expect(contextVersion.createdBy.github).to.not.equal(opts.owner.github)
            expect(contextVersion.createdBy.github).to.equal(ctx.mockUser.accounts.github.id)
            done()
          })
      })

      it('should do a hello runnable copy', function (done) {
        ContextVersion.findOne.yieldsAsync(null, ctx.returnedMockedContextVersion)
        ContextService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser,
          function (err, contextVersion) {
            if (err) { return done(err) }
            // the contextVersion that we receive should be the new one we 'creatd'
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion)
            sinon.assert.calledOnce(ContextVersion.createDeepCopy)
            sinon.assert.calledWithExactly(
              ContextVersion.createDeepCopy,
              ctx.mockUser,
              ctx.mockContextVersion,
              sinon.match.func
            )
            expect(ctx.returnedMockedContextVersion.owner.github).to.equal(ctx.mockUser.accounts.github.id)
            sinon.assert.calledOnce(Context.prototype.save)
            sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
            sinon.assert.calledWithExactly(
              ContextVersion.findOneAndUpdate,
              { _id: ctx.returnedMockedContextVersion._id },
              {
                $set: {
                  context: sinon.match.instanceOf(mongoose.Types.ObjectId),
                  'owner.github': ctx.mockUser.accounts.github.id
                }
              },
              sinon.match.func
            )
            sinon.assert.calledOnce(Runnable.prototype.copyVersionIcvFiles)
            sinon.assert.calledWithExactly(
              Runnable.prototype.copyVersionIcvFiles,
              sinon.match.any,
              ctx.returnedMockedContextVersion._id,
              ctx.mockContextVersion.infraCodeVersion,
              sinon.match.func
            )
            done()
          })
      })

      it('should propogate findOneAndUpdate contextVersion failures', function (done) {
        var error = new Error('Whoa!')
        // rather interestingly, one cannot replace what a defined stub does...
        ContextVersion.findOneAndUpdate.restore()
        sinon.stub(ContextVersion, 'findOneAndUpdate').yieldsAsync(error)
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
          done()
        })
      })

      it('should propogate contextVersion.createDeepCopy failures', function (done) {
        var error = new Error('Whoa Nelly!')
        ContextVersion.createDeepCopy.yieldsAsync(error)
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          sinon.assert.notCalled(ContextVersion.findOneAndUpdate)
          done()
        })
      })
    })

    describe('a CV owned by a any user, not hellorunnable', function () {
      beforeEach(function (done) {
        sinon.spy(ContextVersion, 'findOneAndUpdate')
        done()
      })

      afterEach(function (done) {
        ContextVersion.findOneAndUpdate.restore()
        done()
      })

      it('should do a regular deep copy', function (done) {
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          if (err) { return done(err) }
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          sinon.assert.calledWith(
            ContextVersion.createDeepCopy,
            ctx.mockUser,
            ctx.mockContextVersion,
            sinon.match.func)
          sinon.assert.notCalled(ContextVersion.findOneAndUpdate)
          done()
        })
      })

      it('should propogate copy failures', function (done) {
        var error = new Error('foobar')
        ContextVersion.createDeepCopy.yieldsAsync(error)
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(ContextVersion.createDeepCopy)
          done()
        })
      })
    })
  })
})
