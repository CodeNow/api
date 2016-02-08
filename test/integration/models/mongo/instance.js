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

var async = require('async')
var createCount = require('callback-count')
var error = require('error')

var Instance = require('models/mongo/instance')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')

describe('Instance Model Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })
  afterEach(function (done) {
    Instance.remove({}, done)
  })
  after(function (done) {
    Instance.remove({}, done)
  })
  after(mongooseControl.stop)

  describe('PopulateModels', function () {
    beforeEach(function (done) {
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
    beforeEach(function (done) {
      // Both of the cvs that are saved to the instance have their build.completed removed
      // so that they are different after the update
      mongoFactory.createCompletedCv(ctx.mockSessionUser._id, function (err, cv) {
        if (err) {
          return done(err)
        }
        ctx.cv = cv
        mongoFactory.createBuild(ctx.mockSessionUser._id, ctx.cv, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build = build
          var tempCv = ctx.cv
          // Delete completed so the cv in the instance is 'out of date'
          delete tempCv._doc.build.completed
          mongoFactory.createInstance(ctx.mockSessionUser._id, ctx.build, false, tempCv, function (err, instance) {
            if (err) {
              return done(err)
            }
            ctx.instance = instance
            done()
          })
        })
      })
    })
    beforeEach(function (done) {
      mongoFactory.createCompletedCv(ctx.mockSessionUser._id, function (err, cv) {
        if (err) {
          return done(err)
        }
        ctx.cv2 = cv
        mongoFactory.createBuild(ctx.mockSessionUser._id, ctx.cv2, function (err, build) {
          if (err) {
            return done(err)
          }
          ctx.build2 = build
          var tempCv = ctx.cv2
          delete tempCv._doc.build.completed
          mongoFactory.createInstance(ctx.mockSessionUser._id, ctx.build2, false, tempCv, function (err, instance) {
            if (err) {
              return done(err)
            }
            ctx.instance2 = instance
            done()
          })
        })
      })
    })
    beforeEach(function (done) {
      ctx.instances = [ctx.instance, ctx.instance2]
      done()
    })

    describe('when instances are not all populated', function () {
      it('should fetch build and cv, then update the cv', function (done) {
        Instance.populateModels(ctx.instances, function (err, instances) {
          expect(err).to.not.exist()
          expect(instances[0]._id, 'instance._id').to.deep.equal(ctx.instance._id)
          expect(instances[0].contextVersion, 'cv').to.be.object()
          expect(instances[0].build, 'build').to.be.object()
          expect(instances[0].contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
          expect(instances[0].build._id, 'build._id').to.deep.equal(ctx.build._id)

          expect(instances[1]._id, 'instance 2').to.deep.equal(ctx.instance2._id)
          expect(instances[1].contextVersion, 'cv2').to.be.object()
          expect(instances[1].build, 'build2').to.be.object()
          expect(instances[1].contextVersion._id, 'cv2._id').to.deep.equal(ctx.cv2._id)
          expect(instances[1].build._id, 'build2._id').to.deep.equal(ctx.build2._id)

          var count = createCount(2, done)
          async.retry(
            10,
            function (callback) {
              Instance.findById(ctx.instance._id, function (err, instance) {
                if (err) { return done(err) }
                try {
                  expect(instance.contextVersion, 'cv').to.be.object()
                  expect(instance.build, 'buildId').to.deep.equal(ctx.build._id)
                  expect(instance.contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
                  expect(instance.contextVersion.build, 'cv.build').to.deep.equal(ctx.cv._doc.build)
                } catch (e) {
                  return setTimeout(function () {
                    callback(e)
                  }, 25)
                }
                callback()
              })
            },
            count.next
          )
          async.retry(
            10,
            function (callback) {
              Instance.findById(ctx.instance2._id, function (err, instance) {
                if (err) { return done(err) }
                try {
                  expect(instance.contextVersion, 'cv').to.be.object()
                  expect(instance.build, 'buildId').to.deep.equal(ctx.build2._id)
                  expect(instance.contextVersion._id, 'cv._id').to.deep.equal(ctx.cv2._id)
                  expect(instance.contextVersion.build, 'cv.build').to.deep.equal(ctx.cv2._doc.build)
                } catch (e) {
                  return setTimeout(function () {
                    callback(e)
                  }, 25)
                }
                callback()
              })
            },
            count.next
          )
        })
      })
    })

    describe('when errors happen', function () {
      beforeEach(function (done) {
        sinon.spy(error, 'log')
        done()
      })
      afterEach(function (done) {
        error.log.restore()
        done()
      })

      describe('when an instance is missing its container Inspect', function () {
        it('should report the bad instance and keep going', function (done) {
          ctx.instance2.container = {
            dockerContainer: 'asdasdasd'
          }

          Instance.populateModels(ctx.instances, function (err, instances) {
            expect(err).to.not.exist()
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(error.log)
            sinon.assert.calledWith(
              error.log,
              sinon.match.has('message', 'instance missing inspect data' + ctx.instance2._id)
            )

            expect(instances.length, 'instances length').to.equal(2)
            expect(instances[0]._id, 'instance._id').to.deep.equal(ctx.instance._id)
            expect(instances[0].contextVersion, 'cv').to.be.object()
            expect(instances[0].build, 'build').to.be.object()
            expect(instances[0].contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
            expect(instances[0].build._id, 'build._id').to.deep.equal(ctx.build._id)

            expect(instances[1]._id, 'instance 2').to.deep.equal(ctx.instance2._id)
            expect(instances[1].contextVersion, 'cv2').to.be.object()
            expect(instances[1].build, 'build2').to.be.object()
            expect(instances[1].contextVersion._id, 'cv2._id').to.deep.equal(ctx.cv2._id)
            expect(instances[1].build._id, 'build2._id').to.deep.equal(ctx.build2._id)

            var count = createCount(2, done)
            async.retry(
              10,
              function (callback) {
                Instance.findById(ctx.instance._id, function (err, instance) {
                  if (err) { return done(err) }
                  try {
                    expect(instance.contextVersion, 'cv').to.be.object()
                    expect(instance.build, 'buildId').to.deep.equal(ctx.build._id)
                    expect(instance.contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
                    expect(instance.contextVersion.build, 'cv.build').to.deep.equal(ctx.cv._doc.build)
                  } catch (e) {
                    return setTimeout(function () {
                      callback(e)
                    }, 25)
                  }
                  callback()
                })
              },
              count.next
            )
            async.retry(
              10,
              function (callback) {
                Instance.findById(ctx.instance2._id, function (err, instance) {
                  if (err) { return done(err) }
                  try {
                    expect(instance.contextVersion, 'cv').to.be.object()
                    expect(instance.build, 'buildId').to.deep.equal(ctx.build2._id)
                    expect(instance.contextVersion._id, 'cv._id').to.deep.equal(ctx.cv2._id)
                    expect(instance.contextVersion.build, 'cv.build').to.deep.equal(ctx.cv2._doc.build)
                  } catch (e) {
                    return setTimeout(function () {
                      callback(e)
                    }, 25)
                  }
                  callback()
                })
              },
              count.next
            )
          })
        })
      })
      describe('when a failure happens during a db query', function () {
        describe('CV.find', function () {
          it('should return error', function (done) {
            // This should cause a casting error
            ctx.instance._doc.contextVersion = {
              _id: 'asdasdasd'
            }
            Instance.populateModels(ctx.instances, function (err) {
              expect(err).to.exist()
              done()
            })
          })
        })
        describe('Build.find', function () {
          it('should return error', function (done) {
            // This should cause a casting error
            ctx.instance._doc.build = 'asdasdasd'
            Instance.populateModels(ctx.instances, function (err) {
              expect(err).to.exist()
              done()
            })
          })
        })
      })
    })
  })
})
