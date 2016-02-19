var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var createCount = require('callback-count')
var rabbitMQ = require('models/rabbitmq')
var sinon = require('sinon')
var Docker = require('models/apis/docker')
var dock = require('../../functional/fixtures/dock')
var mongooseControl = require('models/mongo/mongoose-control.js')
var Build = require('models/mongo/build.js')
var ContextVersion = require('models/mongo/context-version.js')
var Instance = require('models/mongo/instance.js')
var User = require('models/mongo/user.js')
var messenger = require('socket/messenger')
var toObjectId = require('utils/to-object-id')
var dockerListenerRabbit = require('docker-listener/lib/hermes-client.js')
var mockFactory = require('../fixtures/factory')

var OnImageBuilderContainerCreate = require('workers/on-image-builder-container-create.js')
var InstanceService = require('models/services/instance-service.js')
var mongoose = require('mongoose')
var ObjectId = mongoose.Types.ObjectId

describe('OnImageBuilderContainerCreate Integration Tests', function () {
  before(mongooseControl.start)
  var ctx = {}
  beforeEach(function (done) {
    ctx = {}
    done()
  })
  before(dock.start.bind(ctx))
  beforeEach(function (done) {
    var oldPublish = dockerListenerRabbit.publish
    ctx.afterOnImageBuildContainerCreate = null
    sinon.stub(dockerListenerRabbit, 'publish', function (queue, data) {
      if (queue === 'on-image-builder-container-create') {
        OnImageBuilderContainerCreate(data)
          .then(function () {
            return ctx.afterOnImageBuildContainerCreate()
          })
          .catch(function (err) {
            return ctx.afterOnImageBuildContainerCreate(err)
          })
      } else if (queue !== 'container.image-builder.started') {
        oldPublish.bind(dockerListenerRabbit)(queue, data)
      }
    })
    rabbitMQ.connect(done)
    rabbitMQ.loadWorkers()
  })
  afterEach(function (done) {
    dockerListenerRabbit.publish.restore()
    rabbitMQ.close(done)
  })
  after(dock.stop.bind(ctx))
  beforeEach(deleteMongoDocs)
  afterEach(deleteMongoDocs)
  function deleteMongoDocs (done) {
    var count = createCount(4, done)
    ContextVersion.remove({}, count.next)
    Instance.remove({}, count.next)
    Build.remove({}, count.next)
    User.remove({}, count.next)
  }
  after(mongooseControl.stop)

  function createImageBuilder () {
    var docker = new Docker()
    ctx.cv.dockerHost = process.env.SWARM_HOST
    var opts = {
      manualBuild: true,
      sessionUser: ctx.user,
      ownerUsername: ctx.user.accounts.github.username,
      contextVersion: ctx.cv,
      network: {
        hostIp: '1.1.1.1'
      },
      tid: 1
    }
    return ctx.cv.populateAsync('infraCodeVersion')
      .then(function () {
        ctx.cv.infraCodeVersion = {
          context: ctx.cv.context
        } // mock
        docker.createImageBuilderAsync(opts)
          .then(function (container) {
            ctx.usedDockerContainer = container
          })
      })
  }
  describe('Running the Worker', function () {
    describe('building builds', function () {
      beforeEach(function (done) {
        ctx.githubId = 10
        var count = createCount(2, done)
        mockFactory.createUser(ctx.githubId, function (err, user) {
          ctx.user = user
          count.next(err)
        })
        mockFactory.createCv(ctx.githubId, function (err, cv) {
          if (err) { return count.next(err) }
          ctx.cv = cv
          mockFactory.createBuild(ctx.githubId, cv, function (err, build) {
            if (err) { return count.next(err) }
            ctx.build = build
            ContextVersion.updateById(ctx.cv._id, {
              $set: {
                'build._id': toObjectId(ctx.build._id)
              }
            }, {}, function (err) {
              if (err) { return count.next(err) }
              ctx.cv.set({
                build: {
                  started: new Date(),
                  _id: new ObjectId()
                }
              })
              ctx.cv.save(function (err) {
                if (err) { return count.next(err) }
                mockFactory.createInstance(ctx.githubId, build, false, ctx.cv, function (err, instance) {
                  ctx.instance = instance
                  count.next(err)
                })
              })
            })
          })
        })
      })

      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'createInstanceContainer')
        sinon.stub(rabbitMQ, 'instanceUpdated')
        sinon.stub(messenger, 'messageRoom')
        sinon.stub(Docker.prototype, 'startContainer').yieldsAsync()

        sinon.spy(Docker.prototype, 'startImageBuilderContainerAsync')

        sinon.spy(ContextVersion, 'updateAsync')
        sinon.spy(ContextVersion, 'findAsync')

        sinon.spy(Instance.prototype, 'emitInstanceUpdate')
        sinon.spy(Instance.prototype, 'updateCv')
        sinon.spy(InstanceService, 'emitInstanceUpdateByCvBuildId')

        sinon.spy(messenger, 'emitContextVersionUpdate')
        sinon.spy(messenger, '_emitInstanceUpdateAction')
        sinon.stub(User, 'anonymousFindGithubUserByGithubId').yieldsAsync(null, {
          login: 'nathan219',
          avatar_url: 'testingtesting123'
        })
        done()
      })
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        rabbitMQ.instanceUpdated.restore()
        messenger.messageRoom.restore()
        Docker.prototype.startContainer.restore()

        Docker.prototype.startImageBuilderContainerAsync.restore()

        ContextVersion.updateAsync.restore()
        ContextVersion.findAsync.restore()

        Instance.prototype.emitInstanceUpdate.restore()
        Instance.prototype.updateCv.restore()
        InstanceService.emitInstanceUpdateByCvBuildId.restore()

        messenger.emitContextVersionUpdate.restore()
        messenger._emitInstanceUpdateAction.restore()
        User.anonymousFindGithubUserByGithubId.restore()

        done()
      })
      describe('With one instance', function () {
        it('should to update the cv and the instance with socket updates', function (done) {
          ctx.afterOnImageBuildContainerCreate = function (err) {
            if (err) {
              return done(err)
            }
            sinon.assert.calledOnce(ContextVersion.updateAsync)
            sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, ctx.usedDockerContainer.id)

            sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
            sinon.assert.calledWith(
              messenger.emitContextVersionUpdate,
              sinon.match.has('_id', ctx.cv._id),
              'build_started'
            )
            sinon.assert.calledOnce(InstanceService.emitInstanceUpdateByCvBuildId)
            sinon.assert.calledWith(
              InstanceService.emitInstanceUpdateByCvBuildId,
              ctx.cv.build._id.toString(),
              'build_started',
              false
            )
            sinon.assert.calledOnce(messenger._emitInstanceUpdateAction)
            sinon.assert.calledWith(
              messenger._emitInstanceUpdateAction,
              sinon.match.has('_id', ctx.instance._id),
              'build_started'
            )
            sinon.assert.calledOnce(Instance.prototype.updateCv)
            sinon.assert.calledOnce(rabbitMQ.instanceUpdated)
            done()
          }
          createImageBuilder()
        })
      })
      describe('With 2 instances', function () {
        beforeEach(function (done) {
          mockFactory.createInstance(ctx.githubId, ctx.build, false, ctx.cv, function (err, instance) {
            ctx.instance2 = instance
            done(err)
          })
        })
        it('should to update the cv and the 2 instances with socket updates', function (done) {
          ctx.afterOnImageBuildContainerCreate = function (err) {
            if (err) {
              return done(err)
            }
            sinon.assert.calledOnce(ContextVersion.updateAsync)
            sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, ctx.usedDockerContainer.id)

            sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
            sinon.assert.calledWith(
              messenger.emitContextVersionUpdate,
              sinon.match.has('_id', ctx.cv._id),
              'build_started'
            )
            sinon.assert.calledOnce(InstanceService.emitInstanceUpdateByCvBuildId)
            sinon.assert.calledWith(
              InstanceService.emitInstanceUpdateByCvBuildId,
              ctx.cv.build._id.toString(),
              'build_started',
              false
            )
            sinon.assert.calledTwice(messenger._emitInstanceUpdateAction)
            sinon.assert.calledWith(
              messenger._emitInstanceUpdateAction,
              sinon.match.has('_id', ctx.instance._id),
              'build_started'
            )
            sinon.assert.calledWith(
              messenger._emitInstanceUpdateAction,
              sinon.match.has('_id', ctx.instance2._id),
              'build_started'
            )
            sinon.assert.calledTwice(Instance.prototype.updateCv)
            sinon.assert.calledTwice(rabbitMQ.instanceUpdated)
            done()
          }
          createImageBuilder()
        })
      })
    })
  })
})
