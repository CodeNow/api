/**
 * @module test/instances-id/patch/index
 */
'use strict'

var Lab = require('lab')
var Code = require('code')
var lab = exports.lab = Lab.script()

var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var expect = Code.expect

var async = require('async')
var createCount = require('callback-count')
var equals = require('101/equals')
var exists = require('101/exists')
var extend = require('extend')
var nock = require('nock')
var noop = require('101/noop')
var not = require('101/not')
var randStr = require('randomstring').generate
var uuid = require('uuid')

var Build = require('models/mongo/build')
var Instance = require('models/mongo/instance')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var dockerMockEvents = require('../../fixtures/docker-mock-events')
var expects = require('../../fixtures/expects')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var sinon = require('sinon')
var rabbitMQ = require('models/rabbitmq')

describe('Instance - PATCH /instances/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  before(function (done) {
    // prevent worker to be created
    sinon.stub(rabbitMQ, 'deleteInstance', function () {})
    done()
  })

  after(function (done) {
    rabbitMQ.deleteInstance.restore()
    done()
  })

  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 1001,
        username: 'Runnable'
      }, {
        id: 100,
        username: 'otherOrg'
      }]
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      if (ctx.moderator) {
        array.push({
          id: ctx.moderator.attrs.accounts.github.id,
          username: ctx.moderator.attrs.accounts.github.username
        })
      }
      if (ctx.nonOwner) {
        array.push({
          id: ctx.nonOwner.attrs.accounts.github.id,
          username: ctx.nonOwner.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)
  /**
   * Patching has a couple of different jobs.  It allows the user to edit the name of the instance,
   * modify it's public/private flag, and now, change it's build.  These tests should not only
   * verify the user can change all of these individually, they should also test everything can
   * be modified all at once
   */
  describe('PATCH', function () {
    describe('Orgs', function () {
      beforeEach(function (done) {
        ctx.orgId = 1001
        var next = createCount(2, done).next
        primus.expectAction('start', next)
        multi.createAndTailInstance(primus, ctx.orgId, function (err, instance, build, user, mdlArray, srcArray) {
          if (err) { return next(err) }
          ctx.instance = instance
          ctx.build = build
          ctx.user = user
          ctx.cv = mdlArray[0]
          ctx.context = mdlArray[1]
          ctx.srcArray = srcArray
          multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
            if (err) { return next(err) }
            ctx.otherBuild = build
            next()
          })
        })
      })
      it('should not allow a user-owned build to be patched to an org-owned instance', function (done) {
        nock.cleanAll()
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        require('../../fixtures/mocks/github/user')(ctx.user)
        var update = {
          build: ctx.otherBuild.id().toString()
        }
        require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
        ctx.instance.update(update, expects.error(400, /owner/, done))
      })
    })

    describe('User', function () {
      beforeEach(function (done) {
        multi.createAndTailInstance(primus, function (err, instance, build, user, mdlArray, srcArray) {
          if (err) { return done(err) }
          // [contextVersion, context, build, user], [srcContextVersion, srcContext, moderator]
          ctx.instance = instance
          ctx.build = build
          ctx.user = user
          ctx.cv = mdlArray[0]
          ctx.context = mdlArray[1]
          ctx.srcArray = srcArray
          require('../../fixtures/mocks/github/user')(ctx.user)
          done()
        })
      })
      describe('Build', function () {
        describe("updating the instance's build with a new, copied build", function () {
          beforeEach(function (done) {
            ctx.newBuild = ctx.build.deepCopy(done)
          })
          describe('without changes in appcodeversion and infracodeversion', function () {
            beforeEach(function (done) {
              multi.buildTheBuild(ctx.user, ctx.newBuild, done)
            })
            it('should deploy the copied build', function (done) {
              var update = {
                build: ctx.newBuild.id().toString()
              }
              var oldDockerContainer = ctx.instance.json().containers[0].dockerContainer
              var expected = {
                _id: ctx.instance.json()._id,
                shortHash: ctx.instance.attrs.shortHash,
                'build._id': ctx.newBuild.id(),
                'owner.github': ctx.user.attrs.accounts.github.id,
                'owner.username': ctx.user.attrs.accounts.github.login
              }
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)

              primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
                if (err) { return done(err) }
                primus.expectAction('start', {}, function () {
                  expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                  ctx.instance.fetch(expects.success(200, expected, function (err) {
                    if (err) { return done(err) }
                    var container = ctx.instance.containers.models[0]
                    expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                    expect(container.attrs.inspect.Env).to.deep.equal([
                      'RUNNABLE_CONTAINER_ID=' + ctx.instance.attrs.shortHash
                    ])
                    done()
                  }))
                })
                ctx.instance.update({json: update}, expects.success(200, expected, noop))
              })
            })

            describe('with env', function () {
              beforeEach(function (done) {
                require('../../fixtures/mocks/github/user')(ctx.user)
                require('../../fixtures/mocks/github/user')(ctx.user)
                ctx.instance.update({ env: ['ONE=1'] }, expects.success(200, done))
              })
              it('should have the env that was set on the instance', function (done) {
                var update = {
                  build: ctx.newBuild.id().toString()
                }
                var expected = {
                  _id: ctx.instance.json()._id,
                  shortHash: ctx.instance.attrs.shortHash,
                  'build._id': ctx.newBuild.id(),
                  'owner.github': ctx.user.attrs.accounts.github.id,
                  'owner.username': ctx.user.attrs.accounts.github.login
                // this represents a new docker container! :)
                // 'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
                }
                var oldDockerContainer = ctx.instance.attrs.containers[0].dockerContainer
                require('../../fixtures/mocks/github/user')(ctx.user)
                require('../../fixtures/mocks/github/user')(ctx.user)
                require('../../fixtures/mocks/github/user')(ctx.user)

                primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
                  if (err) { return done(err) }
                  primus.expectAction('start', {}, function () {
                    expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                    ctx.instance.fetch(expects.success(200, expected, function (err) {
                      if (err) { return done(err) }
                      var container = ctx.instance.containers.models[0]
                      expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                      expect(ctx.instance.attrs.containers[0].inspect.Env).to.deep.equal([
                        'RUNNABLE_CONTAINER_ID=' + ctx.instance.attrs.shortHash,
                        'ONE=1'
                      ])
                      done()
                    }))
                  })
                  ctx.instance.update({json: update}, expects.success(200, expected, noop))
                })
              })
            })
          })
          describe('WITH changes in appcodeversion', function () {
            beforeEach(function (done) {
              primus.joinOrgRoom(ctx.user.json().accounts.github.id, function () {
                done()
              })
            })
            beforeEach(function (done) {
              ctx.newCV = ctx.user
                .newContext(ctx.newBuild.contexts.models[0].id())
                .newVersion(ctx.newBuild.contextVersions.models[0].id())
              async.series([
                ctx.newCV.fetch.bind(ctx.newCV),
                function (done) {
                  // this has to be it's own function since models[0] doesn't exist when the series is created
                  ctx.newCV.appCodeVersions.models[0].update({
                    commit: randStr(5)
                  }, done)
                },
                function (cb) {
                  var cv = ctx.newBuild.contextVersions.models[0]
                  primus.onceVersionComplete(cv.id(), function () {
                    cb()
                  })
                  ctx.newBuild.build({json: { message: uuid() }}, function () {
                    dockerMockEvents.emitBuildComplete(cv)
                  })
                }
              ], done)
            })
            it('should deploy the copied (and modified) build', function (done) {
              var update = {
                build: ctx.newBuild.id().toString()
              }
              var oldDockerContainer = ctx.instance.json().containers[0].dockerContainer
              var expected = {
                _id: ctx.instance.json()._id,
                shortHash: ctx.instance.attrs.shortHash,
                'build._id': ctx.newBuild.id()
              // this represents a new docker container! :)
              // 'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
              }
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)

              primus.expectAction('start', {}, function () {
                expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                ctx.instance.fetch(expects.success(200, expected, function (err) {
                  if (err) { return done(err) }
                  var container = ctx.instance.containers.models[0]
                  expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                  done()
                }))
              })
              require('../../fixtures/mocks/docker/build-logs')()
              ctx.instance.update({json: update}, expects.success(200, expected, noop))
            })
          })
          describe('WITH changes in infracodeversion', function () {
            beforeEach(function (done) {
              require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
              require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
              ctx.newCV = ctx.user
                .newContext(ctx.newBuild.contexts.models[0].id())
                .newVersion(ctx.newBuild.contextVersions.models[0].id())
              async.series([
                ctx.newCV.fetch.bind(ctx.newCV),
                ctx.newCV.rootDir.contents.createFile.bind(ctx.newCV.rootDir.contents, 'file.txt'),
                function (cb) {
                  var cv = ctx.newBuild.contextVersions.models[0]
                  primus.joinOrgRoom(ctx.user.attrs.accounts.github.id, function () {
                    primus.onceVersionBuildRunning(cv.id(), function () {
                      primus.onceVersionComplete(cv.id(), function () {
                        cb()
                      })
                      dockerMockEvents.emitBuildComplete(cv)
                    })
                    ctx.newBuild.build({json: { message: uuid() }}, noop)
                  })
                }
              ], done)
            })
            it('should deploy the copied (and modified) build', function (done) {
              var update = {
                build: ctx.newBuild.id().toString()
              }
              var oldDockerContainer = ctx.instance.json().containers[0].dockerContainer
              var expected = {
                _id: ctx.instance.json()._id,
                shortHash: ctx.instance.attrs.shortHash,
                'build._id': ctx.newBuild.id()
              // this represents a new docker container! :)
              // 'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
              }
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)

              primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
                if (err) { return done(err) }
                primus.expectAction('start', {}, function () {
                  expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                  ctx.instance.fetch(expects.success(200, expected, function (err) {
                    if (err) { return done(err) }
                    var container = ctx.instance.containers.models[0]
                    expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                    done()
                  }))
                })
                ctx.instance.update({json: update}, expects.success(200, expected, noop))
              })
            })
          })
          describe('WITH changes in infracodeversion AND appcodeversion', function () {
            beforeEach(function (done) {
              require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
              require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
              ctx.newCV = ctx.user
                .newContext(ctx.newBuild.contexts.models[0].id())
                .newVersion(ctx.newBuild.contextVersions.models[0].id())
              async.series([
                ctx.newCV.fetch.bind(ctx.newCV),
                function (done) {
                  // this has to be it's own function since models[0] doesn't exist when the series is created
                  ctx.newCV.appCodeVersions.models[0].update({
                    branch: randStr(5)
                  }, done)
                },
                ctx.newCV.rootDir.contents.createFile.bind(ctx.newCV.rootDir.contents, 'file.txt'),
                function (cb) {
                  var cv = ctx.newBuild.contextVersions.models[0]
                  primus.joinOrgRoom(ctx.user.attrs.accounts.github.id, function () {
                    primus.onceVersionBuildRunning(cv.id(), function () {
                      primus.onceVersionComplete(cv.id(), function () {
                        cb()
                      })
                      dockerMockEvents.emitBuildComplete(cv)
                    })
                    ctx.newBuild.build({json: { message: uuid() }}, noop)
                  })
                }
              ], done)
            })
            it('should deploy the copied (and modified) build', function (done) {
              var update = {
                build: ctx.newBuild.id().toString()
              }
              var oldDockerContainer = ctx.instance.json().containers[0].dockerContainer
              var expected = {
                _id: ctx.instance.json()._id,
                shortHash: ctx.instance.attrs.shortHash,
                'build._id': ctx.newBuild.id()
              // this represents a new docker container! :)
              // 'containers[0].dockerContainer': not(equals(ctx.instance.json().containers[0].dockerContainer))
              }
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)

              primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
                if (err) { return done(err) }
                primus.expectAction('start', {}, function () {
                  expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                  ctx.instance.fetch(expects.success(200, expected, function (err) {
                    if (err) { return done(err) }
                    var container = ctx.instance.containers.models[0]
                    expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                    done()
                  }))
                })
                ctx.instance.update({json: update}, expects.success(200, expected, noop))
              })
            })
          })
        })
        describe('Patching an unbuilt build', function () {
          beforeEach(function (done) {
            var data = {
              owner: { github: ctx.user.attrs.accounts.github.id }
            }
            ctx.otherBuild = ctx.user.createBuild(data, done)
          })
          it("shouldn't allow a build that hasn't started ", function (done) {
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.instance.update({ build: ctx.otherBuild.id() },
              expects.error(400, /been started/, done))
          })
          describe('starting build', function () {
            beforeEach(function (done) {
              Build.findById(ctx.otherBuild.id(), function (err, build) {
                if (err) { return done(err) }
                build.setInProgress(ctx.user, function (err) {
                  if (err) {
                    done(err)
                  }
                  ctx.otherBuild.fetch(done)
                })
              })
            })
            it("should not allow a build that has started, but who's CVs have not", function (done) {
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              ctx.instance.update({ build: ctx.otherBuild.id() }, expects.error(400, done))
            })
          })
        })
        describe('Patching an unbuilt build', function () {
          beforeEach(function (done) {
            ctx.otherBuild = ctx.build.deepCopy(done)
          })
          it('should allow a build that has everything started', function (done) {
            var oldDockerContainer = ctx.instance.json().containers[0].dockerContainer
            multi.buildTheBuild(ctx.user, ctx.otherBuild, function () {
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)

              var oldCvId = ctx.instance.contextVersion.id()
              var expected = {
                // Since the containers are not removed until the otherBuild has finished, we should
                // still see them running
                // 'containers[0].inspect.State.Running': true,
                'lastBuiltSimpleContextVersion.id': oldCvId,
                'lastBuiltSimpleContextVersion.created': exists,
                'build._id': ctx.otherBuild.id()
              }

              primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
                if (err) { return done(err) }
                primus.expectAction('start', {}, function () {
                  expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                  expected['containers[0].inspect.State.Running'] = true
                  ctx.instance.fetch(expects.success(200, expected, function (err) {
                    if (err) { return done(err) }
                    var container = ctx.instance.containers.models[0]
                    expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                    done()
                  }))
                })
                ctx.instance.update({ build: ctx.otherBuild.id() }, expects.success(200, expected, noop))
              })
            })
          })
        })
        describe('Testing appcode copying during patch', function () {
          beforeEach(function (done) {
            // We need to deploy the container first before each test.
            multi.createBuiltBuild(ctx.user.attrs.accounts.github.id,
              function (err, build, user, mdlArray) {
                if (err) { done(err) }
                ctx.otherCv = mdlArray[0]
                ctx.otherBuild = build
                done()
              })
          })
          it('should copy the context version app codes during the patch ', function (done) {
            var oldDockerContainer = ctx.instance.json().containers[0].dockerContainer
            var acv = ctx.otherCv.attrs.appCodeVersions[0]
            var expected = {
              // Since the containers are not removed until the otherBuild has finished, we should
              // still see them running
              // 'containers[0].inspect.State.Running': true,
              build: ctx.otherBuild.json()
            // 'contextVersions[0]._id': ctx.otherCv.id(),
            // 'contextVersions[0].appCodeVersions[0]': acv
            }
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
              if (err) { return done(err) }
              primus.expectAction('start', {}, function () {
                expected['containers[0].dockerContainer'] = not(equals(oldDockerContainer))
                expected['containers[0].inspect.State.Running'] = true
                expected['contextVersions[0].appCodeVersions[0]'] = acv
                expected['contextVersions[0]._id'] = ctx.otherCv.id()
                ctx.instance.fetch(expects.success(200, expected, function (err) {
                  if (err) { return done(err) }
                  var container = ctx.instance.containers.models[0]
                  expect(container.attrs.dockerContainer).to.not.equal(oldDockerContainer)
                  done()
                }))
              })
              ctx.instance.update({ build: ctx.otherBuild.id() }, expects.success(200, expected, noop))
            })
          })
        })
        describe('Testing all patching possibilities', function () {
          var updates = [
            {
              public: true
            },
            {
              build: 'newBuild'
            },
            {
              env: ['ONE=1']
            },
            {
              public: true,
              build: 'newBuild'
            },
            {
              build: 'newBuild'
            },
            {
              env: ['sdfasdfasdfadsf=asdfadsfasdfasdf']
            },
            {
              public: true
            },
            {
              build: 'newBuild',
              public: true,
              env: ['THREE=1asdfsdf', 'TWO=dsfasdfas']
            }
          ]
          beforeEach(function (done) {
            // We need to deploy the container first before each test.
            multi.createBuiltBuild(ctx.user.attrs.accounts.github.id, function (err, build) {
              if (err) { done(err) }
              ctx.otherBuild = build
              done()
            })
          })
          updates.forEach(function (json) {
            var keys = Object.keys(json)
            var vals = keys.map(function (key) {
              return json[key]
            })
            it("should update instance's " + keys + ' to ' + vals, function (done) {
              var expected = {
                //  'containers[0].inspect.State.Running': true
              }
              keys.forEach(function (key) {
                if (key === 'build') {
                  json[key] = ctx.otherBuild.id()
                  expected[key] = ctx.otherBuild.json()
                } else {
                  expected[key] = json[key]
                }
              })
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)

              if (~keys.indexOf('build')) {
                primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
                  if (err) { return done(err) }
                  primus.expectAction('start', {}, function () {
                    expected['containers[0].inspect.State.Running'] = true
                    ctx.instance.fetch(expects.success(200, expected, function (err) {
                      if (err) { return done(err) }
                      done()
                    }))
                  })
                  ctx.instance.update({ json: json }, expects.success(200, expected, noop))
                })
              } else {
                ctx.instance.update({ json: json }, expects.success(200, expected, done))
              }
            })
          })
        })
        describe('Locking instance', function () {
          it('should be able to set locked to true', function (done) {
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.instance.update({ locked: true }, function (err, instance) {
              if (err) { return done(err) }
              expect(instance.locked).to.equal(true)
              done()
            })
          })
          it('should be able to set locked to false', function (done) {
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.instance.update({ locked: false }, function (err, instance) {
              if (err) { return done(err) }
              expect(instance.locked).to.equal(false)
              done()
            })
          })
        })
      })

      describe('env', function () {
        it('should update the env', function (done) {
          var body = {
            env: [
              'ONE=1',
              'TWO=2',
              'THREE=3'
            ]
          }
          var expected = body
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.instance.update(body, expects.success(200, expected, function (err) {
            if (err) { return done(err) }
            // sanity check
            ctx.instance.fetch(expects.success(200, expected, done))
          }))
        })
        it('should filter empty/whitespace-only strings from env array', function (done) {
          var body = {
            env: ['', '  ', 'ONE=1']
          }
          var expected = {
            env: ['ONE=1']
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.instance.update(body, expects.success(200, expected, function (err) {
            if (err) { return done(err) }
            // sanity check
            ctx.instance.fetch(expects.success(200, expected, done))
          }))
        })
      })

      var updates = [{
        public: true
      }]
      describe('permissions', function () {
        describe('owner', function () {
          updates.forEach(function (json) {
            var keys = Object.keys(json)
            var vals = keys.map(function (key) {
              return json[key]
            })
            it("should update instance's " + keys + ' to ' + vals, function (done) {
              var expected = extend(json, {
                'containers[0].inspect.State.Running': true
              })
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              ctx.instance.update({ json: json }, expects.success(200, expected, done))
            })
          })
        })
        describe('non-owner', function () {
          beforeEach(function (done) {
            // TODO: remove when I merge in the github permissions stuff
            require('../../fixtures/mocks/github/user-orgs')(100, 'otherOrg')
            ctx.nonOwner = multi.createUser(done)
          })
          updates.forEach(function (json) {
            var keys = Object.keys(json)
            var vals = keys.map(function (key) {
              return json[key]
            })
            it("should not update instance's " + keys + ' to ' + vals + ' (403 forbidden)', function (done) {
              ctx.instance.client = ctx.nonOwner.client // swap auth to nonOwner's
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              ctx.instance.update({ json: json }, expects.errorStatus(403, done))
            })
          })
        })
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done)
          })
          updates.forEach(function (json) {
            var keys = Object.keys(json)
            var vals = keys.map(function (key) {
              return json[key]
            })
            it("should update instance's " + keys + ' to ' + vals, function (done) {
              ctx.instance.client = ctx.moderator.client // swap auth to moderator's
              var expected = extend(json, {
                'containers[0].inspect.State.Running': true
              })
              require('../../fixtures/mocks/github/user')(ctx.user)
              require('../../fixtures/mocks/github/user')(ctx.user)
              ctx.instance.update({ json: json }, expects.success(200, expected, done))
            })
          })
        })
      })

      describe('not founds', function () {
        beforeEach(function (done) {
          Instance.removeById(ctx.instance.id(), done)
        })
        updates.forEach(function (json) {
          var keys = Object.keys(json)
          var vals = keys.map(function (key) {
            return json[key]
          })
          it("should not update instance's " + keys + ' to ' + vals + ' (404 not found)', function (done) {
            require('../../fixtures/mocks/github/user')(ctx.user)
            // create a new instance bc the model is destroyed...
            ctx.user.newInstance(ctx.instance.id()).update({ json: json }, expects.errorStatus(404, done))
          })
        })
      })
    })
  })
})
