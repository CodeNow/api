'use strict'
var createCount = require('callback-count')
var expect = require('code').expect
var Lab = require('lab')
var objectId = require('objectid')
var sinon = require('sinon')

var Build = require('models/mongo/build.js')
var BuildService = require('models/services/build-service')
var ContextVersion = require('models/mongo/context-version.js')
var dock = require('../../functional/fixtures/dock')
var Docker = require('models/apis/docker')
var Instance = require('models/mongo/instance.js')
var messenger = require('socket/messenger')
var mockFactory = require('../fixtures/factory')
var mockOnBuilderDieMessage = require('../fixtures/dockerListenerEvents/on-image-builder-container-die')
var mongooseControl = require('models/mongo/mongoose-control.js')
var Worker = require('workers/container.image-builder.died')

var rabbitMQ = require('models/rabbitmq')
var User = require('models/mongo/user.js')

var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it

describe('OnImageBuilderContainerDie Integration Tests', function () {
  var ctx = {}
  before(mongooseControl.start)

  before(dock.start.bind(ctx))

  beforeEach(function (done) {
    ctx = {}
    done()
  })

  beforeEach(function deleteMongoDocs (done) {
    var count = createCount(4, done)
    ContextVersion.remove({}, count.next)
    Instance.remove({}, count.next)
    Build.remove({}, count.next)
    User.remove({}, count.next)
  })

  before(function (done) {
    sinon.stub(rabbitMQ, 'clearContainerMemory')
    sinon.stub(rabbitMQ, 'pushImage')
    done()
  })

  after(function (done) {
    rabbitMQ.pushImage.restore()
    rabbitMQ.clearContainerMemory.restore()
    done()
  })

  afterEach(function deleteMongoDocs (done) {
    var count = createCount(4, done)
    ContextVersion.remove({}, count.next)
    Instance.remove({}, count.next)
    Build.remove({}, count.next)
    User.remove({}, count.next)
  })

  after(dock.stop.bind(ctx))

  after(mongooseControl.stop)

  describe('Running the Worker', function () {
    describe('deploying a manual build', function () {
      beforeEach(function (done) {
        ctx.githubId = 10
        var count = createCount(2, createImageBuilder)
        mockFactory.createUser(ctx.githubId, function (err, user) {
          ctx.user = user
          count.next(err)
        })
        mockFactory.createStartedCv(ctx.githubId, function (err, cv) {
          if (err) { return count.next(err) }
          ctx.cv = cv
          mockFactory.createBuild(ctx.githubId, cv, function (err, build) {
            if (err) { return count.next(err) }
            ctx.build = build
            ContextVersion.updateById(ctx.cv._id, {
              $set: {
                'build._id': objectId(ctx.build._id)
              }
            }, {}, function (err) {
              if (err) { return count.next(err) }
              ContextVersion.findById(ctx.cv._id, function (err, cv) {
                if (err) { return count.next(err) }
                ctx.cv = cv
                mockFactory.createInstance(ctx.githubId, build, false, cv, function (err, instance) {
                  ctx.instance = instance
                  count.next(err)
                })
              })
            })
          })
        })
        function createImageBuilder (err) {
          if (err) { return done(err) }
          var docker = new Docker()
          ctx.cv.dockerHost = process.env.SWARM_HOST
          var opts = {
            manualBuild: true,
            sessionUser: ctx.user,
            ownerUsername: ctx.user.accounts.github.username,
            contextVersion: ctx.cv,
            network: {
              hostIp: '1.1.1.1'
            }
          }
          ctx.cv.populate('infraCodeVersion', function () {
            if (err) { return done(err) }
            ctx.cv.infraCodeVersion = {
              context: ctx.cv.context
            } // mock
            docker.createImageBuilder(opts, function (err, container) {
              if (err) { return done(err) }
              ctx.usedDockerContainer = container
              ContextVersion.updateBy('_id', ctx.cv._id, {
                $set: {
                  'build.dockerContainer': container.id,
                  'build.dockerTag': Docker.getDockerTag(opts.contextVersion)
                }
              }, {}, function (err) {
                if (err) { return done(err) }
                ContextVersion.findById(ctx.cv._id, function (err, cv) {
                  if (err) { return done(err) }
                  ctx.cv = cv
                  Instance.findOneAndUpdate({
                    _id: ctx.instance._id
                  }, {
                    $set: { contextVersion: ctx.cv.toJSON() }
                  }, function (err, instance) {
                    ctx.instance = instance
                    done(err)
                  })
                })
              })
            })
          })
        }
      })

      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'createInstanceContainer')
        sinon.stub(rabbitMQ, 'instanceUpdated')
        sinon.stub(messenger, 'messageRoom')
        sinon.spy(Instance, 'emitInstanceUpdates')
        sinon.spy(Instance.prototype, 'emitInstanceUpdate')
        sinon.spy(messenger, '_emitInstanceUpdateAction')
        sinon.spy(messenger, 'emitContextVersionUpdate')
        sinon.spy(BuildService, 'updateSuccessfulBuild')
        sinon.spy(BuildService, 'updateFailedBuild')
        sinon.spy(Build, 'updateFailedByContextVersionIds')
        sinon.spy(Build, 'updateCompletedByContextVersionIds')
        sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, {
          login: 'nathan219',
          avatar_url: 'testingtesting123'
        })
        done()
      })
      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        rabbitMQ.instanceUpdated.restore()
        messenger.messageRoom.restore()
        messenger._emitInstanceUpdateAction.restore()
        messenger.emitContextVersionUpdate.restore()
        Instance.emitInstanceUpdates.restore()
        Instance.prototype.emitInstanceUpdate.restore()
        BuildService.updateSuccessfulBuild.restore()
        BuildService.updateFailedBuild.restore()
        Build.updateFailedByContextVersionIds.restore()
        Build.updateCompletedByContextVersionIds.restore()
        User.prototype.findGithubUserByGithubId.restore()
        done()
      })

      describe('With a successful build', function () {
        it('should attempt to deploy', function (done) {
          var job = mockOnBuilderDieMessage(ctx.cv, ctx.usedDockerContainer, ctx.user)
          Worker.task(job)
            .asCallback(function (err) {
              if (err) { done(err) }
              sinon.assert.calledOnce(BuildService.updateSuccessfulBuild)
              sinon.assert.calledOnce(Build.updateCompletedByContextVersionIds)
              sinon.assert.notCalled(Build.updateFailedByContextVersionIds)

              sinon.assert.calledWith(
                messenger.emitContextVersionUpdate,
                sinon.match({_id: ctx.cv._id}),
                'build_completed'
              )
              sinon.assert.calledTwice(messenger.messageRoom)

              var cvCall = messenger.messageRoom.getCall(0)
              sinon.assert.calledWith(
                cvCall,
                'org',
                ctx.githubId,
                sinon.match({
                  event: 'CONTEXTVERSION_UPDATE',
                  action: 'build_completed',
                  data: sinon.match({_id: ctx.cv._id})
                })
              )
              sinon.assert.calledOnce(messenger._emitInstanceUpdateAction)

              var instanceCall = messenger.messageRoom.getCall(1)
              sinon.assert.calledWith(
                instanceCall,
                'org',
                ctx.githubId,
                sinon.match({
                  event: 'INSTANCE_UPDATE',
                  action: 'patch',
                  data: sinon.match({
                    _id: ctx.instance._id,
                    owner: {
                      github: ctx.githubId,
                      username: 'nathan219',
                      gravatar: 'testingtesting123'
                    },
                    createdBy: {
                      github: ctx.githubId,
                      username: 'nathan219',
                      gravatar: 'testingtesting123'
                    },
                    contextVersion: sinon.match({
                      _id: ctx.cv._id,
                      build: sinon.match({
                        failed: sinon.match.falsy,
                        completed: sinon.match.truthy
                      })
                    })
                  })
                })
              )
              sinon.assert.calledOnce(rabbitMQ.instanceUpdated)

              sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
              sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
                contextVersionId: ctx.cv._id.toString(),
                instanceId: ctx.instance._id.toString(),
                ownerUsername: ctx.user.accounts.github.username,
                sessionUserGithubId: ctx.user.accounts.github.id.toString()
              })
              ContextVersion.findOne(ctx.cv._id, function (err, cv) {
                if (err) { return done(err) }
                expect(cv.build.completed).to.exist()
                Build.findBy('contextVersions', cv._id, function (err, builds) {
                  if (err) { return done(err) }
                  builds.forEach(function (build) {
                    expect(build.completed).to.exist()
                  })
                  done()
                })
              })
            })
        })
      })
      describe('With an unsuccessful build', function () {
        it('should update the UI with a socket event', function (done) {
          var job = mockOnBuilderDieMessage(ctx.cv, ctx.usedDockerContainer, ctx.user, 1)
          Worker.task(job)
            .asCallback(function (err) {
              if (err) { return done(err) }
              sinon.assert.calledOnce(BuildService.updateFailedBuild)

              sinon.assert.calledOnce(Build.updateFailedByContextVersionIds)
              // updateFailedByContextVersionIds calls updateCompletedByContextVersionIds
              sinon.assert.calledOnce(Build.updateCompletedByContextVersionIds)
              sinon.assert.calledWith(
                messenger.emitContextVersionUpdate,
                sinon.match({_id: ctx.cv._id}),
                'build_completed'
              )
              sinon.assert.calledTwice(messenger.messageRoom)

              // the first call is a build_running
              var cvCall = messenger.messageRoom.getCall(0)
              sinon.assert.calledWith(
                cvCall,
                'org',
                ctx.githubId,
                sinon.match({
                  event: 'CONTEXTVERSION_UPDATE',
                  action: 'build_completed',
                  data: sinon.match({_id: ctx.cv._id})
                })
              )
              sinon.assert.calledOnce(messenger._emitInstanceUpdateAction)

              var instanceCall = messenger.messageRoom.getCall(1)
              sinon.assert.calledWith(
                instanceCall,
                'org',
                ctx.githubId,
                sinon.match({
                  event: 'INSTANCE_UPDATE',
                  action: 'patch',
                  data: sinon.match({
                    _id: ctx.instance._id,
                    owner: {
                      github: ctx.githubId,
                      username: 'nathan219',
                      gravatar: 'testingtesting123'
                    },
                    createdBy: {
                      github: ctx.githubId,
                      username: 'nathan219',
                      gravatar: 'testingtesting123'
                    },
                    contextVersion: sinon.match({
                      _id: ctx.cv._id,
                      build: sinon.match({
                        failed: sinon.match.truthy,
                        completed: sinon.match.truthy
                      })
                    })
                  })
                })
              )
              sinon.assert.calledOnce(rabbitMQ.instanceUpdated)

              sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
              ContextVersion.findOne(ctx.cv._id, function (err, cv) {
                if (err) { return done(err) }
                expect(cv.build.completed).to.exist()
                expect(cv.build.failed).to.be.true()
                Build.findBy('contextVersions', cv._id, function (err, builds) {
                  if (err) { return done(err) }
                  builds.forEach(function (build) {
                    expect(build.completed).to.exist()
                    expect(build.failed).to.be.true()
                  })
                  done()
                })
              })
            })
        })
      })
      describe('With 2 CVs, one that dedups', function () {
        beforeEach(function (done) {
          mockFactory.createStartedCv(ctx.githubId, ctx.cv.toJSON(), function (err, version) {
            if (err) { return done(err) }
            ctx.cv2 = version
            mockFactory.createBuild(ctx.githubId, ctx.cv2, function (err, build) {
              if (err) { return done(err) }
              ctx.build2 = build
              ctx.cv2.copyBuildFromContextVersion(ctx.cv, function (err) {
                if (err) { return done(err) }
                ContextVersion.findById(ctx.cv2._id, function (err, cv) {
                  ctx.cv2 = cv
                  done(err)
                })
              })
            })
          })
        })
        describe('both cvs are attached to the same instance, one after the other', function () {
          beforeEach(function (done) {
            Instance.findOneAndUpdate({
              _id: ctx.instance._id
            }, {
              $set: { contextVersion: ctx.cv2.toJSON() }
            }, function (err, instance) {
              ctx.instance = instance
              done(err)
            })
          })

          it('should update the instance with the second cv, and update both cvs', function (done) {
            var job = mockOnBuilderDieMessage(ctx.cv, ctx.usedDockerContainer, ctx.user)
            Worker.task(job)
              .asCallback(function (err) {
                if (err) { return done(err) }
                sinon.assert.calledOnce(BuildService.updateSuccessfulBuild)
                sinon.assert.calledOnce(Build.updateCompletedByContextVersionIds)
                sinon.assert.notCalled(Build.updateFailedByContextVersionIds)

                sinon.assert.calledWith(
                  messenger.emitContextVersionUpdate,
                  sinon.match({_id: ctx.cv._id}),
                  'build_completed'
                )
                sinon.assert.calledWith(
                  messenger.emitContextVersionUpdate,
                  sinon.match({_id: ctx.cv2._id}),
                  'build_completed'
                )
                sinon.assert.calledOnce(messenger._emitInstanceUpdateAction)

                sinon.assert.calledWith(messenger._emitInstanceUpdateAction, sinon.match({
                  _id: ctx.instance._id
                }), 'patch')

                sinon.assert.calledThrice(messenger.messageRoom)
                // Since these basically happen at the same time, I can't separate the cv calls
                sinon.assert.calledWith(
                  messenger.messageRoom,
                  'org',
                  ctx.githubId,
                  sinon.match({
                    event: 'CONTEXTVERSION_UPDATE',
                    action: 'build_completed',
                    data: sinon.match({_id: ctx.cv._id})
                  })
                )
                sinon.assert.calledWith(
                  messenger.messageRoom,
                  'org',
                  ctx.githubId,
                  sinon.match({
                    event: 'CONTEXTVERSION_UPDATE',
                    action: 'build_completed',
                    data: sinon.match({_id: ctx.cv2._id})
                  })
                )

                var instanceCall = messenger.messageRoom.getCall(2)
                sinon.assert.calledWith(
                  instanceCall,
                  'org',
                  ctx.githubId,
                  sinon.match({
                    event: 'INSTANCE_UPDATE',
                    action: 'patch',
                    data: sinon.match({
                      _id: ctx.instance._id,
                      owner: {
                        github: ctx.githubId,
                        username: 'nathan219',
                        gravatar: 'testingtesting123'
                      },
                      createdBy: {
                        github: ctx.githubId,
                        username: 'nathan219',
                        gravatar: 'testingtesting123'
                      },
                      contextVersion: sinon.match({
                        _id: ctx.cv2._id,
                        build: sinon.match({
                          failed: sinon.match.falsy,
                          completed: sinon.match.truthy
                        })
                      })
                    })
                  })
                )
                sinon.assert.calledOnce(rabbitMQ.instanceUpdated)

                sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
                sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
                  contextVersionId: ctx.cv2._id.toString(),
                  instanceId: ctx.instance._id.toString(),
                  ownerUsername: ctx.user.accounts.github.username,
                  sessionUserGithubId: ctx.user.accounts.github.id.toString()
                })
                Instance.findById(ctx.instance._id, function (err, instance) {
                  if (err) {
                    return done(err)
                  }
                  expect(instance.contextVersion.build.completed).to.exist()
                  ContextVersion.findBy('build._id', ctx.build._id, function (err, cvs) {
                    if (err) {
                      return done(err)
                    }
                    expect(cvs.length).to.equal(2)
                    cvs.forEach(function (cv) {
                      expect(cv.build.completed).to.exist()
                    })
                    Build.findBy('contextVersions', ctx.cv2._id, function (err, builds) {
                      if (err) {
                        return done(err)
                      }
                      builds.forEach(function (build) {
                        expect(build.completed).to.exist()
                      })
                      done()
                    })
                  })
                })
              })
          })
        })
      })
    })
  })
})
