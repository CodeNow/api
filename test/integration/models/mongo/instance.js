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

var createCount = require('callback-count')
var error = require('error')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')

describe('Instance Model Query Integration Tests', function () {
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
          mongoFactory.createInstance(ctx.mockSessionUser._id, ctx.build, false, ctx.cv, function (err, instance) {
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
          mongoFactory.createInstance(ctx.mockSessionUser._id, ctx.build2, false, ctx.cv2, function (err, instance) {
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
    afterEach(function (done) {
      Instance.findOneAndUpdateAsync.restore()
      done()
    })

    describe('when instances are not all populated', function () {
      it('should fetch build and cv, then update the cv', function (done) {
        var count = createCount(2, function () {
          // do this setTimeout so the Instance.findOneAndUpdateAsync stub has knowledge of
          // both calls
          setTimeout(function () {
            try {
              sinon.assert.calledTwice(Instance.findOneAndUpdateAsync)
              sinon.assert.calledWith(Instance.findOneAndUpdateAsync, {
                _id: ctx.instance._id
              }, {
                $set: {
                  contextVersion: ctx.cv.toJSON()
                }
              })
              sinon.assert.calledWith(Instance.findOneAndUpdateAsync, {
                _id: ctx.instance2._id
              }, {
                $set: {
                  contextVersion: ctx.cv2.toJSON()
                }
              })
              done()
            } catch (err) {
              done(err)
            }
          }, 0)
        })
        sinon.stub(Instance, 'findOneAndUpdateAsync', count.next)
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
        })
      })
    })

    describe('when errors happen', function () {
      var testErr = new Error('Test Error!')
      beforeEach(function (done) {
        sinon.stub(error, 'log')
        done()
      })
      afterEach(function (done) {
        error.log.restore()
        done()
      })

      describe('when an instance is missing its container Inspect', function () {
        it('should remove the bad instance and keep going', function (done) {
          ctx.instance2.container = {
            dockerContainer: 'asdasdasd'
          }
          sinon.stub(Instance, 'findOneAndUpdateAsync', function () {
            try {
              sinon.assert.calledOnce(error.log)
              sinon.assert.calledWith(
                error.log,
                sinon.match.has('message', 'instance missing inspect data' + ctx.instance2._id)
              )
              sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
              sinon.assert.calledWith(Instance.findOneAndUpdateAsync, {
                _id: ctx.instance._id
              }, {
                $set: {
                  contextVersion: ctx.cv.toJSON()
                }
              })
              done()
            } catch (err) {
              done(err)
            }
          })

          Instance.populateModels(ctx.instances, function (err, instances) {
            expect(err).to.not.exist()
            if (err) {
              done(err)
            }
            expect(instances.length, 'instances length').to.equal(1)
            expect(instances[0]._id, 'instance._id').to.deep.equal(ctx.instance._id)
            expect(instances[0].contextVersion, 'cv').to.be.object()
            expect(instances[0].build, 'build').to.be.object()
            expect(instances[0].contextVersion._id, 'cv._id').to.deep.equal(ctx.cv._id)
            expect(instances[0].build._id, 'build._id').to.deep.equal(ctx.build._id)
          })
        })
      })
      describe('when a failure happens during a db query', function () {
        beforeEach(function (done) {
          sinon.spy(Instance, 'findOneAndUpdateAsync')
          done()
        })
        describe('CV.find', function () {
          beforeEach(function (done) {
            sinon.stub(ContextVersion, 'find').yieldsAsync(testErr)
            done()
          })
          afterEach(function (done) {
            ContextVersion.find.restore()
            done()
          })
          it('should return error', function (done) {
            Instance.populateModels(ctx.instances, function (err) {
              expect(err).to.exist()
              setTimeout(function () {
                sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
                done()
              })
            })
          })
        })
        describe('Build.find', function () {
          beforeEach(function (done) {
            sinon.stub(Build, 'find').yieldsAsync(testErr)
            done()
          })
          afterEach(function (done) {
            Build.find.restore()
            done()
          })
          it('should return error', function (done) {
            Instance.populateModels(ctx.instances, function (err) {
              expect(err).to.exist()
              setTimeout(function () {
                sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
                done()
              })
            })
          })
        })
      })
    })
  })
})
