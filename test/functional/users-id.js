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

var expects = require('./fixtures/expects')
var api = require('./fixtures/api-control')
var multi = require('./fixtures/multi-factory')

describe('User - /users/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  beforeEach(require('./fixtures/mocks/github/login'))
  beforeEach(require('./fixtures/mocks/github/login'))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  describe('PATCH', function () {
    describe('registered', function () {
      beforeEach(function (done) {
        ctx.user = multi.createUser(done)
      })

      it('should update the user with the new option', function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': true,
          'userOptions.uiState.previousLocation.instance': 'cheeseburgers'
        }, function (err, body, code) {
          if (err) {
            return done(err)
          }

          expect(code).to.equal(200)
          expectNoSensitiveFields(body)
          expect(body.userOptions).to.equal({
            uiState: {
              shownCoachMarks: {
                editButton: true
              },
              previousLocation: {
                instance: 'cheeseburgers'
              }
            }
          })
          done()
        })
      })

      it("should error when data isn't correct", function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': {awesome: true}
        }, expects.error(400, /must be a boolean/, done))
      })

      it('should be able to update consecutively without losing data ', function (done) {
        ctx.user.update({
          'userOptions.uiState.shownCoachMarks.editButton': true,
          'userOptions.uiState.previousLocation.instance': 'cheeseburgers'
        }, function (err, body, code) {
          if (err) {
            return done(err)
          }

          expect(code).to.equal(200)
          expect(body.userOptions).to.equal({
            uiState: {
              shownCoachMarks: {
                editButton: true
              },
              previousLocation: {
                instance: 'cheeseburgers'
              }
            }
          })
          ctx.user.update({
            'userOptions.uiState.shownCoachMarks.repoList': true
          }, function (err, body, code) {
            if (err) {
              return done(err)
            }
            expect(code).to.equal(200)
            expect(body.userOptions).to.equal({
              uiState: {
                shownCoachMarks: {
                  editButton: true,
                  repoList: true
                },
                previousLocation: {
                  instance: 'cheeseburgers'
                }
              }
            })
            done()
          })
        })
      })
    })
  })
})

/**
 * Validate route strips sensitive fields from response objects
 */
function expectNoSensitiveFields (user) {
  var github = user.accounts.github
  expect(github.accessToken).to.not.exist()
  expect(github._json).to.not.exist()
}
