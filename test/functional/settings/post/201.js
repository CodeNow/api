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

describe('201 POST /settings', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  describe('create new settings', function () {
    it('should be possible to create settings with slack', function (done) {
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
          done()
        })
      })
    })
  })
})
