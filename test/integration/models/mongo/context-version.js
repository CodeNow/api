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

var assign = require('101/assign')
var defaults = require('101/defaults')
var isFunction = require('101/is-function')
var put = require('101/put')
var last = require('101/last')
var mongoose = require('mongoose')
var ObjectId = mongoose.Types.ObjectId
var sinon = require('sinon')
var uuid = require('uuid')
var Hermes = require('runnable-hermes')
var rabbitMQ = require('models/rabbitmq')

var messenger = require('socket/messenger')
var mongooseControl = require('models/mongo/mongoose-control.js')
var mongoFactory = require('../../fixtures/factory')
var Context = require('models/mongo/context.js')
var ContextVersion = require('models/mongo/context-version.js')
var InfraCodeVersion = require('models/mongo/infra-code-version.js')

describe('ContextVersion Model Query Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
    ctx.mockSessionUser = {
      _id: 1234,
      findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
        login: 'TEST-login',
        avatar_url: 'TEST-avatar_url'
      }),
      accounts: {
        github: {
          id: 1234
        }
      }
    }
    done()
  })
  afterEach(function (done) {
    ContextVersion.remove({}, done)
  })

  after(function (done) {
    ContextVersion.remove({}, done)
  })
  after(mongooseControl.stop)

  describe('methods', function () {
    //describe('updateBuildHash', function () {
    //  beforeEach(function (done) {
    //    ctx.hash = uuid()
    //    createStartedCv(function (err, cv) {
    //      if (err) { return done(err) }
    //      ctx.cv = cv
    //      done()
    //    })
    //  })
    //
    //  it('should update the build.hash property on the document', function (done) {
    //    var hash = 'abcdef'
    //    ctx.cv.updateBuildHash(hash, function (err) {
    //      if (err) { return done(err) }
    //      // expect build.hash updated on document
    //      expect(ctx.cv.build.hash).to.equal(hash)
    //      // expect build.hash updated on document in database
    //      ContextVersion.findById(ctx.cv._id, function (err, cv) {
    //        if (err) { return done(err) }
    //        expect(cv.build.hash).to.equal(hash)
    //        done()
    //      })
    //    })
    //  })
    //})
    //
    //describe('findPendingDupe', function () {
    //  beforeEach(function (done) {
    //    ctx.props = {
    //      build: { hash: uuid() }
    //    }
    //    done()
    //  })
    //  beforeEach(function (done) {
    //    function createCv (i, cb) {
    //      var props = put(ctx.props, {
    //        'build.started': new Date('Mon Jan 1 2015 ' + i + ':00:00 GMT-0700 (PDT)'),
    //        'build.completed': new Date('Mon Jan 1 2015 ' + i + ':00:30 GMT-0700 (PDT)')
    //      })
    //      createCompletedCv(props, cb)
    //    }
    //    ctx.completedDupes = []
    //    createCv(1, function (err, cv2) {
    //      if (err) { return done(err) }
    //      ctx.completedDupes.push(cv2)
    //      createCv(2, function (err, cv1) {
    //        if (err) { return done(err) }
    //        ctx.completedDupes.push(cv1)
    //        createCv(3, function (err, cv) {
    //          if (err) { return done(err) }
    //          ctx.completedDupes.push(cv)
    //          done()
    //        })
    //      })
    //    })
    //  })
    //  beforeEach(function (done) {
    //    function createCv (i, cb) {
    //      var props = put(ctx.props, {
    //        'build.started': new Date('Mon Jan 1 2015 12:00:0' + i + ' GMT-0700 (PDT)')
    //      })
    //      createStartedCv(props, cb)
    //    }
    //    ctx.startedDupes = []
    //    createCv(1, function (err, cv) {
    //      if (err) { return done(err) }
    //      ctx.startedDupes.push(cv)
    //      createCv(2, function (err, cv) {
    //        if (err) { return done(err) }
    //        ctx.startedDupes.push(cv)
    //        createCv(3, function (err, cv) {
    //          if (err) { return done(err) }
    //          ctx.startedDupes.push(cv)
    //          ctx.cv = cv
    //          done()
    //        })
    //      })
    //    })
    //  })
    //
    //  it('should find the oldest pending dupe', function (done) {
    //    ctx.cv.findPendingDupe(function (err, oldestStartedDupe) {
    //      if (err) { return done(err) }
    //      expect(oldestStartedDupe).to.exist()
    //      expect(oldestStartedDupe._id.toString()).to.equal(ctx.startedDupes[0]._id.toString())
    //      done()
    //    })
    //  })
    //})
    //
    //describe('findCompletedDupe', function () {
    //  beforeEach(function (done) {
    //    ctx.props = {
    //      build: { hash: uuid() }
    //    }
    //    done()
    //  })
    //  beforeEach(function (done) {
    //    function createCv (i, cb) {
    //      var props = put(ctx.props, {
    //        'build.started': new Date('Mon Jan 1 2015 ' + i + ':00:00 GMT-0700 (PDT)'),
    //        'build.completed': new Date('Mon Jan 1 2015 ' + i + ':00:30 GMT-0700 (PDT)')
    //      })
    //      createCompletedCv(props, cb)
    //    }
    //    ctx.completedDupes = []
    //    createCv(1, function (err, cv2) {
    //      if (err) { return done(err) }
    //      ctx.completedDupes.push(cv2)
    //      createCv(2, function (err, cv1) {
    //        if (err) { return done(err) }
    //        ctx.completedDupes.push(cv1)
    //        createCv(3, function (err, cv) {
    //          if (err) { return done(err) }
    //          ctx.completedDupes.push(cv)
    //          done()
    //        })
    //      })
    //    })
    //  })
    //  beforeEach(function (done) {
    //    function createCv (i, cb) {
    //      var props = put(ctx.props, {
    //        'build.started': new Date('Mon Jan 1 2015 12:00:0' + i + ' GMT-0700 (PDT)')
    //      })
    //      createStartedCv(props, cb)
    //    }
    //    ctx.startedDupes = []
    //    createCv(1, function (err, cv) {
    //      if (err) { return done(err) }
    //      ctx.startedDupes.push(cv)
    //      createCv(2, function (err, cv) {
    //        if (err) { return done(err) }
    //        ctx.startedDupes.push(cv)
    //        createCv(3, function (err, cv) {
    //          if (err) { return done(err) }
    //          ctx.startedDupes.push(cv)
    //          ctx.cv = cv
    //          done()
    //        })
    //      })
    //    })
    //  })
    //
    //  it('should find the oldest pending dupe', function (done) {
    //    ctx.cv.findCompletedDupe(function (err, youngestCompletedDupe) {
    //      if (err) { return done(err) }
    //      expect(youngestCompletedDupe).to.exist()
    //      expect(youngestCompletedDupe._id.toString()).to.equal(last(ctx.completedDupes)._id.toString())
    //      done()
    //    })
    //  })
    //})

    describe('.buildSelf', function () {
      afterEach(function (done) {
        InfraCodeVersion.remove({}, done)
      })
      beforeEach(function (done) {
        Context.remove({}, done)
      })
      afterEach(function (done) {
        Context.remove({}, done)
      })
      beforeEach(function (done) {
        mongoFactory.createCv(ctx.mockSessionUser._id, null, function (err, cv) {
          if (err) { return done(err) }
          ctx.cv = cv
          done()
        })
      })
      beforeEach(function (done) {
        ctx.domain = {
          runnableData: {
            tid: uuid()
          }
        }
        mongoFactory.createInfraCodeVersion({context: ctx.cv.context}, function (err, icv) {
          if (err) { return done(err) }
          ctx.icv = icv
          ctx.icv.save(done)
        })
      })
      beforeEach(function (done) {
        ctx.cv.infraCodeVersion = ctx.icv._id
        ctx.cv.save(done)
      })
      beforeEach(function (done) {
        sinon.spy(ContextVersion.prototype, 'modifyAppCodeVersionWithLatestCommitAsync')
        sinon.spy(ContextVersion.prototype, 'dedupeAsync')
        sinon.spy(ContextVersion, 'removeByIdAsync')
        sinon.spy(ContextVersion, '_startBuild')
        sinon.spy(ContextVersion.prototype, 'setBuildStartedAsync')
        sinon.spy(ContextVersion.prototype, 'populateOwnerAsync')
        sinon.spy(ContextVersion.prototype, 'dedupeBuildAsync')
        sinon.spy(rabbitMQ, 'createImageBuilderContainer')

        sinon.stub(Hermes, 'hermesSingletonFactory').returns({
          on: sinon.spy(),
          connect: sinon.spy(function (cb) { cb() }),
          publish: sinon.spy()
        })
        sinon.stub(messenger, 'messageRoom')
        rabbitMQ.connect(done)
      })
      afterEach(function (done) {
        ContextVersion.removeByIdAsync.restore()
        ContextVersion._startBuild.restore()
        rabbitMQ.createImageBuilderContainer.restore()
        Hermes.hermesSingletonFactory.restore()
        messenger.messageRoom.restore()
        ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync.restore()
        ContextVersion.prototype.dedupeAsync.restore()
        ContextVersion.prototype.setBuildStartedAsync.restore()
        ContextVersion.prototype.populateOwnerAsync.restore()
        ContextVersion.prototype.dedupeBuildAsync.restore()
        done()
      })
      describe('failures', function () {
        beforeEach(function (done) {
          mongoFactory.createStartedCv(ctx.mockSessionUser._id, null, function (err, cv) {
            if (err) { return done(err) }
            ctx.startedCv = cv
            cv.save(done)
          })
        })
        it('should reject a build that has started', function (done) {
          var opts = {
            message: 'manual build',
            triggeredAction: {
              manual: true
            }
          }
          ContextVersion.buildSelf(ctx.startedCv, ctx.mockSessionUser, opts, ctx.domain)
            .catch(function (err) {
              expect(err.message).to.contain('cannot build a context version that is already building or built')
              sinon.assert.notCalled(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync)
              sinon.assert.notCalled(ContextVersion.prototype.dedupeAsync)
              sinon.assert.notCalled(ContextVersion.removeByIdAsync)
              sinon.assert.notCalled(ContextVersion._startBuild)
            })
            .asCallback(done)
        })
      })

      describe('Builds', function () {
        it('should build a normal build', function (done) {
          var opts = {
            message: 'manual build',
            triggeredAction: {
              manual: true
            }
          }
          ContextVersion.buildSelf(ctx.cv, ctx.mockSessionUser, opts, ctx.domain)
            .then(function (contextVersion) {
              expect(contextVersion._id.toString(), 'cv id').to.equal(ctx.cv._id.toString())
              sinon.assert.calledOnce(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync)
              sinon.assert.calledWith(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync, ctx.mockSessionUser)
              sinon.assert.calledOnce(ContextVersion.prototype.dedupeAsync)
              sinon.assert.notCalled(ContextVersion.removeByIdAsync)
              sinon.assert.calledOnce(ContextVersion._startBuild)
              sinon.assert.calledWith(ContextVersion._startBuild, ctx.cv, ctx.mockSessionUser, opts, ctx.domain);
              sinon.assert.calledOnce(ContextVersion.prototype.setBuildStartedAsync)
              sinon.assert.calledWith(ContextVersion.prototype.setBuildStartedAsync, ctx.mockSessionUser, opts)
              sinon.assert.calledOnce(ContextVersion.prototype.populateOwnerAsync)
              sinon.assert.calledWith(ContextVersion.prototype.populateOwnerAsync, ctx.mockSessionUser)
              sinon.assert.calledOnce(ContextVersion.prototype.dedupeBuildAsync)
              sinon.assert.calledWith(ContextVersion.prototype.dedupeBuildAsync)
              sinon.assert.calledOnce(rabbitMQ.createImageBuilderContainer)
              sinon.assert.calledWith(rabbitMQ.createImageBuilderContainer, sinon.match({
                manualBuild: true,
                sessionUserGithubId: 1234,
                ownerUsername: contextVersion.owner.username,
                contextId: contextVersion.context.toString(),
                contextVersionId: contextVersion._id.toString(),
                noCache: false,
                tid: ctx.domain.runnableData.tid
              }))
            })
            .asCallback(done)
        })
        describe('dedupe checks', function () {
          beforeEach(function (done) {
            mongoFactory.createCompletedCv(ctx.mockSessionUser._id, null, function (err, cv) {
              if (err) {
                return done(err)
              }
              ctx.completedCv = cv
              ctx.completedCv.infraCodeVersion = ctx.icv._id
              ctx.completedCv.save(done)
            })
          })
          describe('dedupe', function () {
            beforeEach(function (done) {
              ContextVersion.createDeepCopy(ctx.mockSessionUser, ctx.completedCv, function (err, copiedCv) {
                if (err) {
                  return done(err)
                }
                ctx.copiedCv = copiedCv
                ctx.copiedCv.save(done)
              })
            })
            it('should dedup to the completed build', function (done) {
              var opts = {
                message: 'manual build',
                triggeredAction: {
                  manual: true
                }
              }
              ContextVersion.buildSelf(ctx.copiedCv, ctx.mockSessionUser, opts, ctx.domain)
                .then(function (contextVersion) {
                  expect(contextVersion._id.toString(), 'cv id').to.equal(ctx.completedCv._id.toString())
                  sinon.assert.calledOnce(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync)
                  sinon.assert.calledWith(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync, ctx.mockSessionUser)
                  sinon.assert.calledOnce(ContextVersion.prototype.dedupeAsync)
                  sinon.assert.calledOnce(ContextVersion.removeByIdAsync)
                  sinon.assert.notCalled(ContextVersion._startBuild)
                  sinon.assert.notCalled(ContextVersion.prototype.setBuildStartedAsync)
                  sinon.assert.notCalled(ContextVersion.prototype.populateOwnerAsync)
                  sinon.assert.notCalled(ContextVersion.prototype.dedupeBuildAsync)
                  sinon.assert.notCalled(rabbitMQ.createImageBuilderContainer)
                  // The copied cv should be deleted
                  return ContextVersion.findByIdAsync(ctx.copiedCv._id)
                    .then(function (shouldBeEmpty) {
                      expect(shouldBeEmpty).to.equal(null)
                    })
                })
                .asCallback(done)
            })
            it('should not dedup the completed build with noCache', function (done) {
              var opts = {
                message: 'manual build',
                triggeredAction: {
                  manual: true
                },
                noCache: true
              }
              ContextVersion.buildSelf(ctx.copiedCv, ctx.mockSessionUser, opts, ctx.domain)
                .then(function (contextVersion) {
                  expect(contextVersion._id.toString(), 'cv id').to.equal(ctx.copiedCv._id.toString())
                  sinon.assert.calledOnce(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync)
                  sinon.assert.calledWith(ContextVersion.prototype.modifyAppCodeVersionWithLatestCommitAsync, ctx.mockSessionUser)
                  sinon.assert.notCalled(ContextVersion.prototype.dedupeAsync)
                  sinon.assert.notCalled(ContextVersion.removeByIdAsync)
                  sinon.assert.calledOnce(ContextVersion._startBuild)
                  sinon.assert.calledWith(ContextVersion._startBuild, ctx.copiedCv, ctx.mockSessionUser, opts, ctx.domain);
                  sinon.assert.calledOnce(ContextVersion.prototype.setBuildStartedAsync)
                  sinon.assert.calledWith(ContextVersion.prototype.setBuildStartedAsync, ctx.mockSessionUser, opts)
                  sinon.assert.calledOnce(ContextVersion.prototype.populateOwnerAsync)
                  sinon.assert.calledWith(ContextVersion.prototype.populateOwnerAsync, ctx.mockSessionUser)
                  sinon.assert.notCalled(ContextVersion.prototype.dedupeBuildAsync)
                  sinon.assert.calledOnce(rabbitMQ.createImageBuilderContainer)
                  sinon.assert.calledWith(rabbitMQ.createImageBuilderContainer, sinon.match({
                    manualBuild: true,
                    sessionUserGithubId: ctx.mockSessionUser.accounts.github.id,
                    ownerUsername: contextVersion.owner.username,
                    contextId: contextVersion.context.toString(),
                    contextVersionId: contextVersion._id.toString(),
                    noCache: true,
                    tid: ctx.domain.runnableData.tid
                  }))
                })
                .asCallback(done)
            })
          })
        })
      })
    })
  })

  /* Utils */
  function createStartedCv (props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    props = props || { build: {} }
    defaults(props.build, {
      hash: uuid(),
      started: new Date()
    })
    var data = cvTemplate(props.build.hash, props.build.started)
    ContextVersion.create(data, cb)
  }
  function createCompletedCv (props, cb) {
    if (isFunction(props)) {
      cb = props
      props = null
    }
    props = props || { build: {} }
    defaults(props.build, {
      hash: uuid(),
      started: new Date(new Date() - 60 * 1000),
      completed: new Date()
    })
    var data = cvTemplate(props.build.hash, props.build.started, props.build.completed)
    ContextVersion.create(data, cb)
  }
})
function cvTemplate (hash, started, completed) {
  started = started || new Date()
  var cv = {
    infraCodeVersion: new ObjectId(),
    createdBy: {
      github: 2
    },
    context: new ObjectId(),
    owner: {
      github: 1
    },
    build: {
      triggeredAction: {
        manual: true
      },
      _id: new ObjectId(),
      triggeredBy: {
        github: 2
      },
      started: started,
      hash: hash,
      network: {
        hostIp: '10.250.197.190'
      }
    },
    advanced: true,
    appCodeVersions: [],
    created: new Date(started - 60 * 1000),
    __v: 0,
    containerId: '55dbd00c5f899e0e0004b12d',
    dockerHost: 'http://10.0.1.79:4242'
  }
  if (completed) {
    assign(cv.build, {
      dockerTag: 'registry.runnable.com/544628/123456789012345678901234:12345678902345678901234',
      dockerContainer: '1234567890123456789012345678901234567890123456789012345678901234',
      dockerImage: 'bbbd03498dab',
      completed: completed
    })
  }
  return cv
}
