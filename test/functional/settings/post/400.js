'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var Code = require('code')
var expect = Code.expect

var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')
var typesTests = require('../../fixtures/types-test-util')

describe('400 POST /settings', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  describe('create new settings', function () {
    it('should not create setting without an owner', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err) }
        var settings = {
          notifications: {
            slack: {
              apiToken: 'xoxo-dasjdkasjdk243248392482394',
              githubUsernameToSlackIdMap: {
                'cheese': 'U023BECGF'
              }
            }
          }
        }
        runnable.createSetting({json: settings}, function (err) {
          expect(err.data.statusCode).to.equal(400)
          expect(err.data.message).to.equal('Owner is mandatory')
          done()
        })
      })
    })

    it('should not be possible to create settings for the same owner twice', function (done) {
      multi.createUser(function (err, runnable) {
        if (err) { return done(err) }
        var settings = {
          owner: {
            github: runnable.attrs.accounts.github.id
          },
          notifications: {
            slack: {
              apiToken: 'xoxo-dasjdkasjdk243248392482394',
              githubUsernameToSlackIdMap: {
                'cheese': 'U023BECGF'
              }
            }
          }
        }
        runnable.createSetting({json: settings}, function (err, body) {
          if (err) { return done(err) }
          expect(body._id).to.exist()
          expect(body.owner.github).to.equal(runnable.attrs.accounts.github.id)
          expect(body.notifications.slack.apiToken).to.equal(
            settings.notifications.slack.apiToken
          )
          expect(body.notifications.slack.githubUsernameToSlackIdMap).to.deep.equal(
            settings.notifications.slack.githubUsernameToSlackIdMap
          )
          runnable.createSetting({json: settings}, function (err) {
            expect(err.data.statusCode).to.equal(409)
            expect(err.data.error).to.equal('Conflict')
            expect(err.data.message).to.contain('already exists')
            expect(err.data.message).to.contain('setting')
            done()
          })
        })
      })
    })

    describe('invalid types', function () {
      var def = {
        action: 'create a setting',
        requiredParams: [
          {
            name: 'owner',
            type: 'object',
            keys: [
              {
                name: 'github',
                type: 'number'
              }
            ]
          }
        ]
      }

      typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
        multi.createUser(function (err, runnable) {
          if (err) { return cb(err) }
          runnable.createSetting({json: body}, cb)
        })
      })
    })
  })
})
