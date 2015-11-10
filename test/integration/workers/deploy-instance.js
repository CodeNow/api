var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var before = lab.before
var after = lab.after
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var createCount = require('callback-count')
var uuid = require('uuid')
var rabbitMQ = require('models/rabbitmq')
var sinon = require('sinon')

var dock = require('../../functional/fixtures/dock')
var mockFactory = require('../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
var Build = require('models/mongo/build.js')
var ContextVersion = require('models/mongo/context-version.js')
var Instance = require('models/mongo/instance.js')
var User = require('models/mongo/user.js')
var messenger = require('socket/messenger')

var DeployInstanceWorker = require('workers/deploy-instance.js')

describe('DeployInstanceWorker Integration Tests', function () {
  before(mongooseControl.start)
  var ctx = {}
  beforeEach(function (done) {
    ctx = {}
    done()
  })

  before(dock.start.bind(ctx))
  after(dock.stop.bind(ctx))
  after(function (done) {
    var count = createCount(4, done)
    ContextVersion.remove({}, count.next)
    Instance.remove({}, count.next)
    Build.remove({}, count.next)
    User.remove({}, count.next)
  })
  afterEach(function (done) {
    var count = createCount(4, done)
    ContextVersion.remove({}, count.next)
    Instance.remove({}, count.next)
    Build.remove({}, count.next)
    User.remove({}, count.next)
  })
  after(mongooseControl.stop)

  describe('Running the Worker', function () {
    describe('deploying a manual build', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'createInstanceContainer')
        done()
      })
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        messenger._emitInstanceUpdateAction.restore()
        User.prototype.findGithubUserByGithubId.restore()
        done()
      })
      beforeEach(function (done) {
        ctx.githubId = 10
        mockFactory.createUser(ctx.githubId, function (err, user) {
          if (err) {
            return done(err)
          }
          ctx.user = user
          ctx.hash = uuid()
          var props = {
            build: {
              triggeredAction: {manual: true}
            }
          }
          mockFactory.createCompletedCv(ctx.githubId, props, function (err, cv) {
            if (err) {
              return done(err)
            }
            ctx.cv = cv
            mockFactory.createBuild(ctx.githubId, cv, function (err, build) {
              if (err) {
                return done(err)
              }
              ctx.build = build
              done()
            })
          })
        })
      })
      describe('with 2 instances (1 locked, 1 unlocked', function () {
        beforeEach(function (done) {
          var count = createCount(2, done)
          mockFactory.createInstance(
            ctx.githubId,
            ctx.build,
            false,
            ctx.cv,
            count.next
          )
          mockFactory.createInstance(
            ctx.githubId,
            ctx.build,
            true,
            ctx.cv,
            count.next
          )
        })
        it('should deploy both instances', function (done) {
          sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user)
          var worker = new DeployInstanceWorker({
            buildId: ctx.build._id,
            sessionUserGithubId: ctx.user.accounts.github.id,
            ownerUsername: ctx.user.accounts.github.username
          })

          var count = createCount(3, function () {
            expect(rabbitMQ.createInstanceContainer.callCount, 'createInstanceContainer')
              .to.equal(2)
            expect(rabbitMQ.createInstanceContainer.args[0][0].cvId, 'createInstanceContainer.cv')
              .to.equal(ctx.cv._id.toString())
            expect(
              rabbitMQ.createInstanceContainer.args[0][0].sessionUserId,
              'createInstanceContainer.sessionUserId'
            ).to.equal(ctx.user.accounts.github.id)
            expect(rabbitMQ.createInstanceContainer.args[1][0].cvId, 'createInstanceContainer.cv')
              .to.equal(ctx.cv._id.toString())
            expect(
              rabbitMQ.createInstanceContainer.args[1][0].sessionUserId,
              'createInstanceContainer.sessionUserId'
            ).to.equal(ctx.user.accounts.github.id)
            done()
          })
          sinon.stub(messenger, '_emitInstanceUpdateAction', count.next)
          worker.handle(function (err) {
            expect(err).to.be.undefined()
            count.next()
          })
        })
      })
      describe('no instances', function () {
        it('should log an acceptable error, but return no error', function (done) {
          sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user)
          var worker = new DeployInstanceWorker({
            buildId: ctx.build._id,
            sessionUserGithubId: ctx.user.accounts.github.id,
            ownerUsername: ctx.user.accounts.github.username
          })
          sinon.stub(messenger, '_emitInstanceUpdateAction')
          worker.handle(function (err) {
            expect(err).to.be.undefined()
            expect(messenger._emitInstanceUpdateAction.callCount).to.equal(0)
            done()
          })
        })
      })
    })
    describe('deploying an automatic build', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'createInstanceContainer')
        done()
      })
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        User.prototype.findGithubUserByGithubId.restore()
        done()
      })
      beforeEach(function (done) {
        ctx.githubId = 10
        mockFactory.createUser(ctx.githubId, function (err, user) {
          if (err) {
            return done(err)
          }
          ctx.user = user
          ctx.hash = uuid()
          var props = {
            build: {
              triggeredAction: {manual: false}
            }
          }
          mockFactory.createCompletedCv(ctx.githubId, props, function (err, cv) {
            if (err) {
              return done(err)
            }
            ctx.cv = cv
            mockFactory.createBuild(ctx.githubId, cv, function (err, build) {
              if (err) {
                return done(err)
              }
              ctx.build = build
              done()
            })
          })
        })
      })

      describe('with 2 instances (1 locked, 1 unlocked', function () {
        beforeEach(function (done) {
          var count = createCount(2, done)
          mockFactory.createInstance(
            ctx.githubId,
            ctx.build,
            false,
            ctx.cv,
            function (err, instance) {
              ctx.instance = instance
              count.next(err)
            })
          mockFactory.createInstance(
            ctx.githubId,
            ctx.build,
            true,
            ctx.cv,
            function (err, instance) {
              ctx.lockedInstance = instance
              count.next(err)
            })
          sinon.stub(messenger, '_emitInstanceUpdateAction')
        })
        afterEach(function (done) {
          messenger._emitInstanceUpdateAction.restore()
          done()
        })
        it('should deploy only the unlocked instance', function (done) {
          sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user)
          var worker = new DeployInstanceWorker({
            buildId: ctx.build._id,
            sessionUserGithubId: ctx.user.accounts.github.id,
            ownerUsername: ctx.user.accounts.github.username
          })

          worker.handle(function (err) {
            expect(err).to.be.undefined()
            sinon.assert.calledWith(
              messenger._emitInstanceUpdateAction,
              sinon.match({
                _id: ctx.instance._id
              }),
              'deploy'
            )
            expect(rabbitMQ.createInstanceContainer.callCount, 'createInstanceContainer')
              .to.equal(1)
            expect(rabbitMQ.createInstanceContainer.args[0][0].cvId, 'createInstanceContainer.cv')
              .to.equal(ctx.cv._id.toString())
            expect(
              rabbitMQ.createInstanceContainer.args[0][0].sessionUserId,
              'createInstanceContainer.sessionUserId'
            ).to.equal(ctx.user.accounts.github.id)
            done()
          })
        })
      })
    })
  })
})
