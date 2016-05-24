'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var expects = require('./fixtures/expects')
var exists = require('101/exists')
var primus = require('./fixtures/primus')

describe('Builds - /builds', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  beforeEach(function (done) {
    ctx.user = multi.createUser(done)
  })
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: 1,
        username: 'Runnable'
      }, {
        id: 2,
        username: 'otherOrg'
      }]
    })
  )
  afterEach(mockGetUserById.stubAfter)

  describe('POST', function () {
    describe('empty body', function () {
      it('should create a build', function (done) {
        var expected = {
          _id: exists,
          'owner.github': ctx.user.attrs.accounts.github.id,
          'createdBy.github': ctx.user.attrs.accounts.github.id
        }
        ctx.user.createBuild(expects.success(201, expected, done))
      })
    })
    describe('specify owner', function () {
      describe('owner is github org user is a member of', function () {
        it('should create a build', function (done) {
          var body = {
            owner: {
              github: 1
            }
          }
          var expected = {
            _id: exists,
            'owner.github': body.owner.github,
            'createdBy.github': ctx.user.attrs.accounts.github.id
          }
          require('./fixtures/mocks/github/user-orgs')(body.owner.github, 'orgname')
          ctx.user.createBuild(body, expects.success(201, expected, done))
        })
      })
      describe('owner is github org user is NOT a member of', function () {
        it('should create a build', function (done) {
          var body = {
            owner: {
              github: 1
            }
          }
          require('./fixtures/mocks/github/user-orgs')(2, 'otherorg')
          ctx.user.createBuild(body, expects.error(403, /denied/, done))
        })
      })
    })
  })
})
