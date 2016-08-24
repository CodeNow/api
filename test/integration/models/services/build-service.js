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
require('sinon-as-promised')(require('bluebird'))

var BuildService = require('models/services/build-service')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
var BigPoppaClient = require('@runnable/big-poppa-client')

describe('Build Services Integration Tests', function () {
  before(mongooseControl.start)
  beforeEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)
  describe('.createBuild', function () {
    var mockSessionUser
    var ownerId
    var mockCv
    beforeEach(function (done) {
      mockSessionUser = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ownerId = 11111
      done()
    })
    beforeEach(function (done) {
      sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([{
        id: ownerId,
        organizations: [{
          githubId: 11111
        }]
      }])
      done()
    })
    afterEach(function (done) {
      BigPoppaClient.prototype.getUsers.restore()
      done()
    })
    describe('create new build', function () {
      beforeEach(function (done) {
        mongoFactory.createCompletedCv(ownerId, function (err, cv) {
          if (err) {
            return done(err)
          }
          mockCv = cv
          done()
        })
      })
      it('should create a build with the CV id attached', function (done) {
        var body = {
          contextVersion: mockCv._id.toString(),
          owner: {
            github: ownerId
          }
        }
        BuildService.createBuild(body, mockSessionUser)
          .then(function (build) {
            expect(build).to.exist()
            expect(build.contextVersion.toString()).to.equal(mockCv._id.toString())
          })
          .asCallback(done)
      })
    })
  })
})
