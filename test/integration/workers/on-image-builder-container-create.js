var Lab = require('lab')
var lab = exports.lab = Lab.script()
var Code = require('code')
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
var ContextVersion = require('models/mongo/context-version.js')
var Instance = require('models/mongo/instance.js')
var User = require('models/mongo/user.js')
var messenger = require('socket/messenger')
var toObjectId = require('utils/to-object-id')
var mockFactory = require('../fixtures/factory')
var mockOnBuilderCreateMessage = require('../fixtures/dockerListenerEvents/on-image-builder-container-create')

var expect = Code.expect
var OnImageBuilderContainerCreate = require('workers/on-image-builder-container-create.js')
var InstanceService = require('models/services/instance-service.js')
var Promise = require('bluebird')
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
  after(dock.stop.bind(ctx))
  beforeEach(require('../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)

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
                  if (err) { return count.next(err) }
                  ctx.instance = instance
                  mockFactory.createInfraCodeVersion({context: ctx.cv.context}, function (err, icv) {
                    if (err) { return count.next(err) }
                    ctx.icv = icv
                    ctx.icv.save(count.next)
                  })
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
        it('should emit the single CV and instance events', function (done) {
          var job = mockOnBuilderCreateMessage(ctx.cv)
          OnImageBuilderContainerCreate(job)
            .then(function () {
              sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
              sinon.assert.calledWith(
                messenger.emitContextVersionUpdate,
                sinon.match.has('_id', ctx.cv._id),
                'build_started'
              )
              sinon.assert.calledOnce(messenger._emitInstanceUpdateAction)
              sinon.assert.calledWith(
                messenger._emitInstanceUpdateAction,
                sinon.match.has('_id', ctx.instance._id),
                'build_started'
              )
            })
            .asCallback(done)
        })
        it('should update the contextVersion and the instance with the new Docker info', function (done) {
          var job = mockOnBuilderCreateMessage(ctx.cv)
          OnImageBuilderContainerCreate(job)
            .then(function () {
              sinon.assert.calledOnce(ContextVersion.updateAsync)
              sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, job.id)

              sinon.assert.calledOnce(Instance.prototype.updateCv)
              sinon.assert.calledOnce(rabbitMQ.instanceUpdated)
              return ContextVersion.findByIdAsync(ctx.cv._id)
            })
            .then(function (cv) {
              // ensure the cv was updated
              expect(cv.dockerHost).to.equal(job.host)
              return Instance.findByIdAsync(ctx.instance._id)
            })
            .then(function (instance) {
              // ensure the instance was updated
              expect(instance.contextVersion.dockerHost).to.equal(job.host)
            })
            .asCallback(done)
        })
      })
      describe('With 2 instances', function () {
        beforeEach(function (done) {
          mockFactory.createInstance(ctx.githubId, ctx.build, false, ctx.cv, function (err, instance) {
            ctx.instance2 = instance
            done(err)
          })
        })
        it('should emit the single CV and 2 instance events', function (done) {
          var job = mockOnBuilderCreateMessage(ctx.cv)
          OnImageBuilderContainerCreate(job)
            .then(function () {
              sinon.assert.calledOnce(messenger.emitContextVersionUpdate)
              sinon.assert.calledWith(
                messenger.emitContextVersionUpdate,
                sinon.match.has('_id', ctx.cv._id),
                'build_started'
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
            })
            .asCallback(done)
        })
        it('should update the cv and the 2 instances with new Docker info', function (done) {
          var job = mockOnBuilderCreateMessage(ctx.cv)
          OnImageBuilderContainerCreate(job)
            .then(function () {
              sinon.assert.calledOnce(ContextVersion.updateAsync)
              sinon.assert.calledWith(Docker.prototype.startImageBuilderContainerAsync, job.id)
              sinon.assert.calledTwice(Instance.prototype.updateCv)
              sinon.assert.calledTwice(rabbitMQ.instanceUpdated)
              return ContextVersion.findByIdAsync(ctx.cv._id)
            })
            .then(function (cv) {
              // ensure the cv was updated
              expect(cv.dockerHost).to.equal(job.host)
              return Promise.props({
                instance: Instance.findByIdAsync(ctx.instance._id),
                instance2: Instance.findByIdAsync(ctx.instance2._id)
              })
            })
            .then(function (data) {
              // ensure the instances were updated
              expect(data.instance.contextVersion.dockerHost).to.equal(job.host)
              expect(data.instance2.contextVersion.dockerHost).to.equal(job.host)
            })
            .asCallback(done)
        })
      })
    })
  })
})
