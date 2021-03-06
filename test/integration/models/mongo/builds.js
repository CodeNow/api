'use strict'

var sinon = require('sinon')
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

var validation = require('../../fixtures/validation')(lab)
var mongooseControl = require('models/mongo/mongoose-control.js')

var Build = require('models/mongo/build')

var ctx = {}

describe('Build Model Integration Tests', function () {
  before(mongooseControl.start)
  afterEach(function (done) {
    Build.remove({}, done)
  })

  after(function (done) {
    Build.remove({}, done)
  })
  after(mongooseControl.stop)

  function createNewBuild () {
    return new Build({
      owner: { github: validation.VALID_GITHUB_ID },
      contexts: [validation.VALID_OBJECT_ID],
      contextVersions: [validation.VALID_OBJECT_ID],
      created: Date.now(),
      createdBy: { github: validation.VALID_GITHUB_ID }
    })
  }

  function createNewUser () {
    return {
      password: 'pass',
      name: 'test',
      accounts: {
        github: {
          id: '1234'
        }
      }
    }
  }

  it('should be able to save a build!', function (done) {
    var build = createNewBuild()
    build.save(function (err, build) {
      if (err) { return done(err) }
      expect(build).to.exist()
      done()
    })
  })

  describe('CreatedBy Validation', function () {
    validation.githubUserRefValidationChecking(createNewBuild, 'createdBy.github')
  // validation.requiredValidationChecking(createNewBuild, 'createdBy')
  })

  describe('Owner Validation', function () {
    validation.githubUserRefValidationChecking(createNewBuild, 'owner.github')
    validation.requiredValidationChecking(createNewBuild, 'owner')
  })

  describe('Context Ids Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'contexts', true)
  })

  describe('Version Ids Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'contextVersions', true)
  })

  describe('Testing SetInProgress', function () {
    var ctx = {}
    beforeEach(function (done) {
      ctx.build = createNewBuild()
      ctx.build.save(function (err, build) {
        if (err) { return done(err) }
        build.setInProgress(createNewUser(), function (err, newbuild) {
          if (err) {
            done(err)
          } else {
            ctx.build = newbuild
            done()
          }
        })
      })
    })
    afterEach(function (done) {
      delete ctx.build
      done()
    })
    it('should be able to set the build in progress', function (done) {
      expect(ctx.build).to.exist()
      done()
    })
    it('should create another build, and the buildNumber should be higher ', function (done) {
      ctx.build2 = createNewBuild()
      ctx.build2.save(function (err, build) {
        if (err) { return done(err) }
        build.setInProgress(createNewUser(), function (err, newbuild) {
          if (err) {
            done(err)
          } else {
            expect(newbuild).to.exist()
            expect(ctx.build.buildNumber).to.be.below(newbuild.buildNumber)
            done()
          }
        })
      })
    })
  })

  describe('updateCompletedByContextVersionIds', function () {
    beforeEach(function (done) {
      ctx.cvIds = []
      sinon.stub(Build, 'updateBy')
      done()
    })
    afterEach(function (done) {
      Build.updateBy.restore()
      done()
    })
    describe('db success', function () {
      beforeEach(function (done) {
        Build.updateBy.yieldsAsync()
        done()
      })
      it('should update builds to completed by cvIds', function (done) {
        Build.updateCompletedByContextVersionIds(ctx.cvIds, true, function cb (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(Build.updateBy,
            'contextVersions',
            { $in: ctx.cvIds },
            sinon.match({
              $set: {
                failed: true,
                completed: sinon.match.truthy
              }
            }),
            { multi: true },
            cb
          )
          done()
        })
      })
      it('should udpate build to completed by cvIds (default: failed)', function (done) {
        Build.updateCompletedByContextVersionIds(ctx.cvIds, function cb (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(Build.updateBy,
            'contextVersions',
            { $in: ctx.cvIds },
            sinon.match({
              $set: {
                failed: false,
                completed: sinon.match.truthy
              }
            }),
            { multi: true },
            cb
          )
          done()
        })
      })
    })
    describe('db err', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        Build.updateBy.yieldsAsync(ctx.err)
        done()
      })
      it('should callback err if db errs', function (done) {
        Build.updateCompletedByContextVersionIds(ctx.cvIds, function (err) {
          expect(err).to.equal(ctx.err)
          done()
        })
      })
    })
  })

  describe('updateFailedByContextVersionIds', function () {
    beforeEach(function (done) {
      ctx.cvIds = []
      sinon.stub(Build, 'updateCompletedByContextVersionIds')
      done()
    })
    afterEach(function (done) {
      Build.updateCompletedByContextVersionIds.restore()
      done()
    })
    describe('db success', function () {
      beforeEach(function (done) {
        Build.updateCompletedByContextVersionIds.yieldsAsync()
        done()
      })
      it('it should call updateCompletedByContextVersionIds w/ true', function (done) {
        Build.updateFailedByContextVersionIds(ctx.cvIds, function cb (err) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Build.updateCompletedByContextVersionIds,
            ctx.cvIds, true, cb
          )
          done()
        })
      })
    })
    describe('db err', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        Build.updateCompletedByContextVersionIds.yieldsAsync(ctx.err)
        done()
      })
      it('it should call updateCompletedByContextVersionIds w/ true', function (done) {
        Build.updateFailedByContextVersionIds(ctx.cvIds, function (err) {
          expect(err).to.equal(ctx.err)
          done()
        })
      })
    })
  })
})
