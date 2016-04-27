'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var before = lab.before
var after = lab.after
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var Build = require('models/mongo/build.js')
var createCount = require('callback-count')
var ContextVersion = require('models/mongo/context-version.js')
var Docker = require('models/apis/docker')
var Dockerode = require('dockerode')
var dock = require('../../functional/fixtures/dock')
var Instance = require('models/mongo/instance.js')
var keypather = require('keypather')()
var messenger = require('socket/messenger')
var mongooseControl = require('models/mongo/mongoose-control.js')
var mockFactory = require('../fixtures/factory')
var mockContainerNetworkAttached = require('../fixtures/dockerListenerEvents/container-network-attached')
var objectId = require('objectid')
var rabbitMQ = require('models/rabbitmq')
var sinon = require('sinon')
var stream = require('stream')
var User = require('models/mongo/user.js')

var ContainerNetworkAttached = require('workers/container.network.attached')

describe('ContainerNetworkAttachedWorker Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })

  beforeEach(require('../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)


  function createStreamFunction (failed, errored) {
    var originalGetContainer = Dockerode.prototype.getContainer
    return function (done) {
      sinon.stub(Dockerode.prototype, 'getContainer', function () {
        var container = originalGetContainer.apply(this, arguments)
        var containerId = keypather.get(ctx, 'usedDockerContainer.id')
        var Readable = stream.Readable
        var buffStream = new Readable()
        if (containerId) {
          var header = new Buffer(8)
          header.fill(1)
          var body
          if (!failed) {
            body = new Buffer('{"type":"log","content":"Successfully built ' + containerId + '"}')
          } else {
            body = new Buffer('{"type":"log","content":"failfailfai fail fail fail"}')
          }
          var buff
          if (errored) {
            buff = Buffer.concat([body]) // will trigger error
          } else {
            buff = Buffer.concat([header, body])
          }
          buffStream.push(buff)
        }
        buffStream.push(null)
        container.logs = sinon.stub().yieldsAsync(null, buffStream)
        return container
      })
      done()
    }
  }
  after(mongooseControl.stop)

  describe('Running the Worker', function () {

    describe('build containers', function () {
      beforeEach(function (done) {
        ctx.githubId = 10
        mockFactory.createUser(ctx.githubId, function (err, user) {
          ctx.user = user
          mockFactory.createInstanceWithProps(ctx.githubId, function (err, instance, build, cv) {
            if (err) {
              done(err)
            }
            ctx.instance = instance
            ctx.build = build
            ctx.cv = cv
          })
        })
      })


      beforeEach(function (done) {
        sinon.stub(messenger, 'messageRoom')
        sinon.spy(Instance, 'emitInstanceUpdates')
        sinon.spy(Instance.prototype, 'emitInstanceUpdate')
        sinon.spy(messenger, '_emitInstanceUpdateAction')
        sinon.spy(messenger, 'emitContextVersionUpdate')
        sinon.spy(Build, 'updateFailedByContextVersionIds')
        sinon.spy(Build, 'updateCompletedByContextVersionIds')
        sinon.spy(ContextVersion, 'updateBuildErrorByContainer')
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
        messenger._emitInstanceUpdateAction.restore()
        messenger.emitContextVersionUpdate.restore()
        Instance.emitInstanceUpdates.restore()
        Instance.prototype.emitInstanceUpdate.restore()
        Build.updateFailedByContextVersionIds.restore()
        Build.updateCompletedByContextVersionIds.restore()
        ContextVersion.updateBuildErrorByContainer.restore()
        User.anonymousFindGithubUserByGithubId.restore()
        done()
      })
      describe('With a successful build', function () {
        beforeEach(createStreamFunction())
        afterEach(function (done) {
          Dockerode.prototype.getContainer.restore()
          done()
        })

        it('should attempt to deploy', function (done) {
          var job = mockContainerNetworkAttached(ctx.cv, ctx.user)
          ContainerNetworkAttached(job)
            .asCallback(function (err) {
              if (err) { done(err) }
              sinon.assert.calledOnce(OnImageBuilderContainerDie._handleBuildComplete)
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
        beforeEach(createStreamFunction(true))
        afterEach(function (done) {
          Dockerode.prototype.getContainer.restore()
          done()
        })

        it('should update the UI with a socket event', function (done) {
          var job = mockOnBuilderDieMessage(ctx.cv, ctx.usedDockerContainer, ctx.user, 1)
          OnImageBuilderContainerDie(job)
            .asCallback(function (err) {
              if (err) { return done(err) }
              sinon.assert.calledOnce(OnImageBuilderContainerDie._handleBuildComplete)

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
          beforeEach(createStreamFunction())
          afterEach(function (done) {
            Dockerode.prototype.getContainer.restore()
            done()
          })

          it('should update the instance with the second cv, and update both cvs', function (done) {
            var job = mockOnBuilderDieMessage(ctx.cv, ctx.usedDockerContainer, ctx.user)
            OnImageBuilderContainerDie(job)
              .asCallback(function (err) {
                if (err) { return done(err) }
                sinon.assert.calledOnce(OnImageBuilderContainerDie._handleBuildComplete)
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
