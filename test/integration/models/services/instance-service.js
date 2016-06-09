'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var messenger = require('socket/messenger')

describe('Instance Services Integration Tests', function () {
  before(mongooseControl.start)
  beforeEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)

  describe('.createInstance', function () {
    var ctx = {}
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'instanceDeployed')
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      sinon.stub(messenger, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.createInstanceContainer.restore()
      messenger.emitInstanceUpdate.restore()
      done()
    })
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        findGithubUserByGithubIdAsync: sinon.spy(function (id) {
          var login = (id === ctx.mockSessionUser.accounts.github.id) ? 'user' : 'owner'
          return Promise.resolve({
            login: login,
            avatar_url: 'TEST-avatar_url'
          })
        }),
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ctx.ownerId = 11111
      ctx.mockOwner = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: ctx.ownerId,
            username: 'owner'
          }
        }
      }
      done()
    })
    describe('create new instance', function () {
      beforeEach(function (done) {
        mongoFactory.createInstanceWithProps(ctx.mockOwner, {
          masterPod: true
        }, function (err, instance, build, cv) {
          if (err) {
            return done(err)
          }
          ctx.otherInstance = instance
          ctx.otherBuild = build
          ctx.otherCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createCompletedCv(1234, function (err, cv) {
          if (err) {
            return done(err)
          }
          ctx.completedCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createBuild(1234, ctx.completedCv, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          done()
        })
      })
      it('should create an instance, create a connection, and fire both Rabbit events', function (done) {
        var body = {
          name: 'asdasdasd',
          env: ['safdsdf=' + ctx.otherInstance.getElasticHostname('owner')],
          build: ctx.build._id.toString(),
          masterPod: true,
          owner: {
            github: ctx.ownerId
          }
        }
        InstanceService.createInstance(body, ctx.mockSessionUser)
          .then(function (instance) {
            expect(instance).to.exist()
            return Instance.findByIdAsync(instance._id)
          })
          .then(function (instance) {
            expect(instance).to.exist()
            var jsoned = instance.toJSON()
            // -----
            expect(jsoned).to.deep.include({
              createdBy: {
                github: 1234,
                gravatar: 'sdasdasdasdasdasd',
                username: 'user'
              },
              owner: {
                github: ctx.ownerId,
                gravatar: 'TEST-avatar_url',
                username: 'owner'
              }
            })
            expect(jsoned).to.deep.include({
              build: ctx.build._id,
              name: body.name,
              lowerName: body.name.toLowerCase(),
              env: body.env
            })
            expect(instance.elasticHostname).to.exist()
            expect(instance.contextVersion._id).to.deep.equal(ctx.completedCv._id)
            // -----
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              cvId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString()
            })
            sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
              contextVersionId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString(),
              ownerUsername: 'owner',
              sessionUserGithubId: 1234
            })
            sinon.assert.calledWith(
              messenger.emitInstanceUpdate,
              sinon.match.has('_id', instance._id),
              'post'
            )
            return instance.getDependenciesAsync()
          })
          .then(function (deps) {
            expect(deps.length).to.equal(1)
          })
          .asCallback(done)
      })
    })
  })

  describe('.updateInstance', function () {
    var ctx = {}
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'instanceDeployed')
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      sinon.stub(rabbitMQ, 'deleteContextVersion')
      sinon.stub(messenger, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      rabbitMQ.instanceDeployed.restore()
      rabbitMQ.createInstanceContainer.restore()
      rabbitMQ.deleteContextVersion.restore()
      messenger.emitInstanceUpdate.restore()
      done()
    })
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        findGithubUserByGithubId: sinon.spy(function (id, cb) {
          var login = (id === ctx.mockSessionUser.accounts.github.id) ? 'user' : 'owner'
          return cb(null, {
            login: login,
            avatar_url: 'sdasdasdasdasdasd'
          })
        }),
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ctx.ownerId = 11111
      ctx.mockOwner = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: ctx.ownerId,
            username: 'owner'
          }
        }
      }
      done()
    })
    describe('update instance with new build', function () {
      beforeEach(function (done) {
        mongoFactory.createInstanceWithProps(ctx.mockOwner, {
          masterPod: true
        }, function (err, instance, build, cv) {
          if (err) {
            return done(err)
          }
          ctx.instance = instance
          ctx.otherBuild = build
          ctx.otherCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createCompletedCv(ctx.ownerId, function (err, cv) {
          if (err) {
            return done(err)
          }
          ctx.completedCv = cv
          done()
        })
      })
      beforeEach(function (done) {
        mongoFactory.createBuild(ctx.ownerId, ctx.completedCv, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          done()
        })
      })
      it('should update the instance, create a new container, delete the contextVersion, and emit an update', function (done) {
        var body = {
          env: ['safdsdf=sadasdas'],
          build: ctx.build._id.toString()
        }
        InstanceService.updateInstance(ctx.instance, body, ctx.mockSessionUser)
          .then(function (instance) {
            expect(instance).to.exist()
            return Instance.findByIdAsync(instance._id)
          })
          .then(function (instance) {
            expect(instance).to.exist()
            var jsoned = instance.toJSON()

            expect(jsoned).to.deep.include({
              build: ctx.build._id,
              env: body.env,
              contextVersion: ctx.completedCv.toJSON()
            })
            expect(instance.elasticHostname).to.exist()
            expect(instance.contextVersion._id).to.deep.equal(ctx.completedCv._id)
            // -----
            sinon.assert.calledWith(rabbitMQ.instanceDeployed, {
              cvId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString()
            })
            sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
              contextVersionId: ctx.completedCv._id.toString(),
              instanceId: instance._id.toString(),
              ownerUsername: 'owner',
              sessionUserGithubId: 1234
            })
            sinon.assert.calledWith(rabbitMQ.deleteContextVersion, {
              contextVersionId: ctx.otherCv._id.toString()
            })
            sinon.assert.calledWith(
              messenger.emitInstanceUpdate,
              sinon.match.has('_id', instance._id),
              'post'
            )
            return instance.getDependenciesAsync()
          })
          .then(function (deps) {
            expect(deps.length).to.equal(0)
          })
          .asCallback(done)
      })
    })
  })
})
