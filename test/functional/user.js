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
var Faker = require('faker')
var expect = Code.expect

var githubAPIUsernameQueryMock = require('./fixtures/mocks/github/users-username')
var githubAPIOrgMembersMock = require('./fixtures/mocks/github/org-members')

var createCount = require('callback-count')
var api = require('./fixtures/api-control')
var multi = require('./fixtures/multi-factory')

describe('User - /users/', function () {
  var ctx = {}
  var orgName = Faker.Helpers.slugify(Faker.Internet.userName())

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  beforeEach(require('./fixtures/mocks/github/login'))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  describe('GET', function () {
    beforeEach(function (done) {
      var count = createCount(done)
      ctx.user = multi.createUser(function (err, user) {
        var githubUserId = ctx.user.attrs.accounts.github.id
        var githubUsername = ctx.user.attrs.accounts.github.login
        githubAPIUsernameQueryMock(githubUserId, githubUsername)
        githubAPIOrgMembersMock(orgName, githubUserId, githubUsername)
        count.inc().next(err, user)
      })
    })

    it('should return an error if no parameters are passed', function (done) {
      ctx.user.fetchUsers({ }, function (err, body, code) {
        expect(err).to.be.an.object()
        expect(err.message).to.match(/query parameters/ig)
        done()
      })
    })

    it('should get an array of users if passed a `githubUsername`', function (done) {
      var githubUsername = ctx.user.attrs.accounts.github.login
      ctx.user.fetchUsers({ githubUsername: githubUsername }, function (err, body, code) {
        if (err) {
          done(err)
        }
        expect(code).to.equal(200)
        expect(body).to.be.an.array()
        expect(body[0]).to.be.an.object()
        expect(body[0]._id).to.be.a.string()
        expect(body[0].accounts).to.be.an.object()
        expect(body[0].accounts.github).to.be.an.object()
        expect(body[0].accounts.github.login).to.be.a.string()
        expect(body[0].accounts.github.login).to.equal(githubUsername)
        expect(body[0].accounts.github.accessToken).to.be.undefined()
        expect(body[0].accounts.github.access_token).to.be.undefined()
        done()
      })
    })

    it('should get an array of users if passed a `githubOrgName`', function (done) {
      var githubUsername = ctx.user.attrs.accounts.github.login
      var githubUserId = ctx.user.attrs.accounts.github.id
      ctx.user.fetchUsers({ githubOrgName: orgName }, function (err, body, code) {
        if (err) {
          done(err)
        }
        expect(code).to.equal(200)
        expect(body).to.be.an.array()
        expect(body[0]).to.be.an.object()
        expect(body[0]._id).to.be.a.string()
        expect(body[0].accounts).to.be.an.object()
        expect(body[0].accounts.github).to.be.an.object()
        expect(body[0].accounts.github.id).to.be.a.number()
        expect(body[0].accounts.github.login).to.be.a.string()
        expect(body[0].accounts.github.id).to.equal(githubUserId)
        expect(body[0].accounts.github.login).to.equal(githubUsername)
        expect(body[0].accounts.github.accessToken).to.be.undefined()
        expect(body[0].accounts.github.access_token).to.be.undefined()
        done()
      })
    })
  })
})

