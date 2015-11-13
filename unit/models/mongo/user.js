/**
 * @module unit/models/mongo/user
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var path = require('path')

var lab = exports.lab = Lab.script()

var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var after = lab.after
var it = lab.it
var expect = Code.expect
var Faker = require('faker')
var nock = require('nock')

var User = require('models/mongo/user')
var githubAPIUsernameQueryMock = require('../../../test/functional/fixtures/mocks/github/users-username')
var githubAPIUsernameMock = require('../../../test/functional/fixtures/mocks/github/user')
require('../../../lib/models/redis')

var moduleName = path.relative(process.cwd(), __filename)

var randomInt = function () {
  return Math.floor(Math.random() * 1000)
}

describe('User ' + moduleName, function () {
  before(require('../../fixtures/mongo').connect)
  after(require('../../../test/functional/fixtures/clean-mongo').removeEverything)

  describe('findByGithubUsername', function () {
    var user
    var email
    var name
    var username
    var githubId

    function createNewUser (done) {
      email = Faker.Internet.email()
      name = Faker.Name.findName()
      username = Faker.Internet.userName()
      githubId = randomInt()
      function createNewUserModel () {
        return new User({
          email: email,
          name: name,
          company: Faker.Company.companyName(),
          accounts: {
            github: {
              id: githubId,
              accessToken: randomInt(),
              refreshToken: randomInt(),
              username: username,
              emails: Faker.Internet.email()
            }
          }
        })
      }
      user = createNewUserModel()
      user.save(done)
    }

    beforeEach(function (done) {
      createNewUser(function () {
        githubAPIUsernameQueryMock(githubId, username)
        githubAPIUsernameMock(githubId, username)
        done()
      })
    })

    afterEach(function (done) {
      nock.cleanAll()
      done()
    })

    it('should have a `findByGithubUsername`', function (done) {
      expect(true).to.equal(true)
      expect(user.findByGithubUsername).to.be.a.function()
      done()
    })

    it('should return an empty list if no user exists', function (done) {
      user.findByGithubUsername('user-that-doesnt-exist', function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(0)
        done()
      })
    })

    it('should find a user from GitHub', function (done) {
      user.findByGithubUsername(username, function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(1)
        expect(res[0]).to.be.an.object()
        expect(res[0].name).to.equal(name)
        expect(res[0].email).to.equal(email)
        expect(res[0].accounts.github.id).to.equal(githubId)
        expect(res[0].accounts.github.username).to.equal(username)
        done()
      })
    })
  })
})
