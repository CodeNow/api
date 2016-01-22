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

var exists = require('101/exists')
var ObjectId = require('mongoose').Types.ObjectId
var sinon = require('sinon')

var api = require('../fixtures/api-control')
var blacklight = require('blacklight')
var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var dock = require('../fixtures/dock')
var dockerMockEvents = require('../fixtures/docker-mock-events')
var expects = require('../fixtures/expects')
var mockGetUserById = require('../fixtures/mocks/github/getByUserId')
var multi = require('../fixtures/multi-factory')
var primus = require('../fixtures/primus')
var rabbitMQ = require('models/rabbitmq')

describe('201 POST /contexts/:id/versions/:id/actions/build', function () {
  var ctx = {}

  beforeEach(function (done) {
    ctx.postBuildAssertions = []
    done()
  })
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: ctx.user.attrs.accounts.github.id,
        username: ctx.user.attrs.accounts.github.username
      }, {
        id: 11111,
        username: 'Runnable'
      }]
    })
  )
  beforeEach(function (done) {
    // stub rabbitMQ.createInstanceContainer because we are not checking for it in this test
    sinon.stub(rabbitMQ, 'createInstanceContainer').returns()
    done()
  })

  before(api.start.bind(ctx))
  before(require('../fixtures/mocks/api-client').setup)
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)

  afterEach(primus.disconnect)
  afterEach(function (done) {
    rabbitMQ.createInstanceContainer.restore()
    done()
  })
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-ctx')(ctx))
  afterEach(require('../fixtures/clean-nock'))
  afterEach(mockGetUserById.stubAfter)

  after(api.stop.bind(ctx))
  after(require('../fixtures/mocks/api-client').clean)
  after(dock.stop.bind(ctx))
  describe('for User', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        if (err) { return done(err) }
        ctx.cv = contextVersion
        ctx.user = user
        done()
      })
    })
    beforeEach(function (done) {
      ctx.bodyOwner = {
        github: ctx.user.attrs.accounts.github.id
      }
      done()
    })

    buildTheVersionTests(ctx)
  })
  describe('for Org by member', function () {
    beforeEach(function (done) {
      ctx.bodyOwner = {
        github: 11111 // org id, requires mocks. (api-client.js)
      } // user belongs to this org.
      done()
    })
    beforeEach(function (done) {
      multi.createContextVersion(ctx.bodyOwner.github, function (err, contextVersion, context, build, user) {
        if (err) { return done(err) }
        ctx.cv = contextVersion
        ctx.user = user
        done()
      })
    })

    buildTheVersionTests(ctx)
  })
})

function buildTheVersionTests (ctx) {
  describe('context version', function () {
    beforeEach(function (done) {
      ctx.expected = ctx.cv.toJSON()
      delete ctx.expected.build
      ctx.expected['build._id'] = exists
      ctx.expected['build.started'] = exists
      ctx.expected['build.triggeredBy.github'] = ctx.user.attrs.accounts.github.id
      ctx.expected['build.triggeredAction.manual'] = true
      done()
    })

    describe('with no appCodeVersions', function () {
      beforeEach(function (done) {
        ctx.noAppCodeVersions = true
        ctx.expected.appCodeVersions = []
        ctx.cv.appCodeVersions.models[0].destroy(done)
      })

      it('should build', function (done) {
        waitForRunningAndEmitBuildComplete(ctx.cv, done)
        require('../fixtures/mocks/github/user')(ctx.user)
        ctx.cv.build(expects.success(201, ctx.expected, function (err) {
          if (err) { return done(err) }
        }))
      })

      describe('copied version', function () {
        beforeEach(function (done) {
          require('../fixtures/mocks/github/user')(ctx.user)
          waitForRunningAndEmitBuildComplete(ctx.cv, done)
          ctx.cv.build(expects.success(201, ctx.expected, function (err) {
            if (err) { return done(err) }
          }))
        })
        beforeEach(function (done) {
          ctx.copiedCv = ctx.cv.deepCopy(done)
        })

        it('should build deduped', function (done) {
          require('../fixtures/mocks/github/user')(ctx.user)
          ctx.copiedCv.build(expects.success(201, ctx.expected, function (err) {
            if (err) { return done(err) }
            // cv was deduped, so dupe is deleted
            ctx.copiedCv.fetch(expects.error(404, done))
          }))
        })

        it('should NOT build deduped with noCache flag', function (done) {
          require('../fixtures/mocks/github/user')(ctx.user)
          waitForRunningAndEmitBuildComplete(ctx.copiedCv, done)
          ctx.copiedCv.build({json: {noCache: true}}, function (err, body) {
            if (err) { return done(err) }
            expect(body._id).not.to.equal(ctx.cv.attrs._id)
            expect(body.id).to.not.equal(ctx.cv.attrs.id)
            expect(body.containerId).to.not.equal(ctx.cv.attrs.build.dockerContainer)
          })
        })

        describe('edited infra', function () {
          beforeEach(function (done) {
            ctx.expected = ctx.copiedCv.toJSON()
            delete ctx.expected.build
            ctx.expected['build._id'] = exists
            ctx.expected['build.started'] = exists
            ctx.expected['build.triggeredBy.github'] = ctx.user.attrs.accounts.github.id
            ctx.expected['build.triggeredAction.manual'] = true
            done()
          })
          beforeEach(function (done) {
            var rootDir = ctx.copiedCv.rootDir
            rootDir.contents.fetch(function (err) {
              if (err) { return done(err) }
              rootDir.contents.models[0].update({ json: {body: 'new'} }, done)
            })
          })

          it('should build', function (done) {
            require('../fixtures/mocks/github/user')(ctx.user)
            waitForRunningAndEmitBuildComplete(ctx.copiedCv, done)
            ctx.copiedCv.build(expects.success(201, ctx.expected, function (err) {
              if (err) { return done(err) }
            }))
          })
        })
      })

      dedupeFirstBuildCompletedTest()
    })

    describe('with one appCodeVersion', function () {
      it('should build', function (done) {
        require('../fixtures/mocks/github/user')(ctx.user)
        waitForRunningAndEmitBuildComplete(ctx.cv, done)
        ctx.cv.build(expects.success(201, ctx.expected, function (err) {
          if (err) { return done(err) }
        }))
      })
    // uncomment when we can build context versions with a specific owner
    // dedupeFirstBuildCompletedTest()
    })

    function dedupeFirstBuildCompletedTest () {
      describe('deduped builds', function () {
        beforeEach(function (done) {
          multi.createContextVersion(ctx.cv.attrs.owner.github, function (err, contextVersion, context, build, user) {
            if (err) { return done(err) }
            ctx.cv2 = contextVersion
            ctx.user2 = user
            done()
          })
        })

        beforeEach(function (done) {
          if (ctx.noAppCodeVersions) {
            ctx.cv2.appCodeVersions.models[0].destroy(done)
          } else {
            done()
          }
        })

        describe('first build completed w/ error', function () {
          beforeEach(function (done) {
            require('../fixtures/mocks/github/user')(ctx.user)
            waitForRunningAndEmitBuildComplete(ctx.cv, function () {
              ContextVersion.findById(new ObjectId(ctx.cv.id()), function (err, cv) {
                if (err) { return done(err) }
                cv.build.completed = new Date()
                cv.build.error = {
                  message: 'Could not create container',
                  stack: '...'
                }
                cv.save(function (err) {
                  if (err) { return done(err) }
                  done()
                })
              })
            })
            ctx.cv.build(expects.success(201, ctx.expected, function (err) {
              if (err) { return done(err) }
            }))
          })

          beforeEach(function (done) {
            ctx.cv2 = ctx.cv.copy({qs: {deep: true}}, function (err) {
              if (err) { return done(err) }
              done()
            })
          })

          it('should NOT dedupe if runnable specific error occured', function (done) {
            ctx.cv2.build(function (err) {
              if (err) { return done(err) }
              expect(ctx.cv.attrs.build).to.not.deep.equal(ctx.cv2.attrs.build)
              expect(ctx.cv.attrs.build.dockerContainer).to.not.equal(ctx.cv2.attrs.build.dockerContainer)
              expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id)
              done()
            })
          })
        })

        describe('first build completed', function () {
          beforeEach(function (done) {
            require('../fixtures/mocks/github/user')(ctx.user)
            waitForRunningAndEmitBuildComplete(ctx.cv, done)
            ctx.cv.build(expects.success(201, ctx.expected, function (err) {
              if (err) { return done(err) }
            }))
          })

          require('../fixtures/equivalent-dockerfiles').forEach(function (fileInfo) {
            it('should dedupe whitespace changes: ' + blacklight.escape(fileInfo), function (done) {
              var rootDir = ctx.cv2.rootDir
              rootDir.contents.fetch(function (err) {
                if (err) { return done(err) }
                rootDir.contents.models[0].update({ json: {body: fileInfo} }, function (err) {
                  if (err) { return done(err) }
                  waitForCompleteAndEmitBuildComplete(ctx.cv2, function (err) {
                    if (err) { return done(err) }
                    try {
                      expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv2.attrs.build)
                      expect(ctx.cv.attrs.build.dockerContainer).to.equal(ctx.cv2.attrs.build.dockerContainer)
                      expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id)
                    } catch (err) {
                      console.log('XXXX ctx.cv.attrs.build', ctx.cv.attrs.build)
                      console.log('XXXX ctx.cv.attrs', ctx.cv.attrs)
                      console.log('XXXX ctx.cv2.attrs.build', ctx.cv2.attrs.build)
                      console.log('XXXX ctx.cv2.attrs', ctx.cv2.attrs)
                      return done(err)
                    }
                    done()
                  })
                  ctx.cv2.build(function (err) {
                    if (err) { return done(err) }
                  })
                })
              })
            })
            it('should NOT dedupe whitespace changes when noCache: ' + blacklight.escape(fileInfo), function (done) {
              var rootDir = ctx.cv2.rootDir
              rootDir.contents.fetch(function (err) {
                if (err) { return done(err) }
                rootDir.contents.models[0].update({ json: {body: fileInfo} }, function (err) {
                  if (err) { return done(err) }
                  waitForCompleteAndEmitBuildComplete(ctx.cv2, function (err) {
                    if (err) { return done(err) }
                    expect(ctx.cv.attrs.build).to.not.deep.equal(ctx.cv2.attrs.build)
                    expect(ctx.cv.attrs.build.dockerContainer).to.not.equal(ctx.cv2.attrs.build.dockerContainer)
                    expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id)
                    done()
                  })
                  ctx.cv2.build({json: {noCache: true}}, function (err) {
                    if (err) { return done(err) }
                  })
                })
              })
            })
          })

          require('../fixtures/different-dockerfiles').forEach(function (fileInfo) {
            it('should NOT dedupe whitespace changes: ' + blacklight.escape(fileInfo), function (done) {
              var rootDir = ctx.cv2.rootDir
              rootDir.contents.fetch(function (err) {
                if (err) { return done(err) }
                rootDir.contents.models[0].update({ json: {body: fileInfo} }, function (err) {
                  if (err) { return done(err) }
                  waitForCompleteAndEmitBuildComplete(ctx.cv2, function (err) {
                    if (err) { return done(err) }
                    expect(ctx.cv.attrs.build).to.not.deep.equal(ctx.cv2.attrs.build)
                    expect(ctx.cv.attrs.build.dockerContainer).to.not.equal(ctx.cv2.attrs.build.dockerContainer)
                    expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id)
                    done()
                  })
                  ctx.cv2.build(function (err) {
                    if (err) { return done(err) }
                  })
                })
              })
            })
          })

          describe('in progress builds', function () {
            beforeEach(function (done) {
              var ownerId = ctx.cv.attrs.owner.github
              multi.createContextVersion(ownerId, function (err, contextVersion, context, build, user) {
                if (err) { return done(err) }
                ctx.cv3 = contextVersion
                ctx.user3 = user
                done()
              })
            })
            beforeEach(function (done) {
              if (ctx.noAppCodeVersions) {
                ctx.cv3.appCodeVersions.models[0].destroy(done)
              } else {
                done()
              }
            })
            it('should dedupe in progress builds', function (done) {
              waitForCompleteAndEmitBuildComplete(ctx.cv2, function (err) {
                if (err) { return done(err) }
                waitForCompleteAndEmitBuildComplete(ctx.cv3, function (err) {
                  if (err) { return done(err) }
                  expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv2.attrs.build)
                  expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv3.attrs.build)
                  expect(ctx.cv.attrs.build.dockerContainer).to.equal(ctx.cv2.attrs.build.dockerContainer)
                  expect(ctx.cv.attrs.build.dockerContainer).to.equal(ctx.cv3.attrs.build.dockerContainer)
                  expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id)
                  expect(ctx.cv.attrs._id).to.not.equal(ctx.cv3.attrs._id)
                  expect(ctx.cv2.attrs._id).to.not.equal(ctx.cv3.attrs._id)
                  done()
                })
              })
              ctx.cv2.build(function (err) {
                if (err) { return done(err) }
                ctx.cv3.build(function (err) {
                  if (err) { return done(err) }
                })
              })
            })
          })
        })

        describe('with in progress builds', function () {
          it('should dedupe', function (done) {
            require('../fixtures/mocks/github/user')(ctx.user)
            waitForRunningAndEmitBuildComplete(ctx.cv, function (err) {
              if (err) { return done(err) }
              waitForRunningAndEmitBuildComplete(ctx.cv2, function (err) {
                if (err) { return done(err) }
                expect(ctx.cv.attrs.build).to.deep.equal(ctx.cv2.attrs.build)
                expect(ctx.cv.attrs.build.dockerContainer).to.equal(ctx.cv2.attrs.build.dockerContainer)
                expect(ctx.cv.attrs._id).to.not.equal(ctx.cv2.attrs._id)
                done()
              })
            })

            ctx.cv.build(function (err) {
              if (err) { return done(err) }
              require('../fixtures/mocks/github/user')(ctx.user2)
              ctx.cv2.build(function (err) {
                if (err) { return done(err) }
              })
            })
          })
        })
      })
    } // dedupeFirstBuildCompletedTest
  })

  function waitForCompleteAndEmitBuildComplete (cvModel, done) {
    cvModel.fetch(function (err) {
      if (err) { return done(err) }
      var cv = cvModel.toJSON()
      if (cv.build.completed) { return done() }
      Context.findById(cv.context, {owner: 1}, function (err, context) {
        if (err) { return done(err) }
        var ownerGithubId = context.owner.github
        primus.joinOrgRoom(ownerGithubId, function () {
          primus.onceVersionComplete(cv._id, function () {
            cvModel.fetch(done)
          })
          dockerMockEvents.emitBuildComplete(cv)
        })
      })
    })
  }

  function waitForRunningAndEmitBuildComplete (cvModel, done) {
    cvModel.fetch(function (err) {
      if (err) { return done(err) }
      var cv = cvModel.toJSON()
      if (cv.build.completed) { return done() }
      Context.findById(cv.context, {owner: 1}, function (err, context) {
        if (err) { return done(err) }
        var ownerGithubId = context.owner.github
        primus.joinOrgRoom(ownerGithubId, function () {
          primus.onceVersionBuildRunning(cv._id, function () {
            primus.onceVersionComplete(cv._id, function () {
              cvModel.fetch(done)
            })
            dockerMockEvents.emitBuildComplete(cv)
          })
        })
      })
    })
  }
}
