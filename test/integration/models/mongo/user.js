/**
 * @module unit/models/mongo/user
 */
'use strict'

var Code = require('code')
var Lab = require('lab')

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
require('sinon-as-promised')(require('bluebird'))

var User = require('models/mongo/user')
var githubAPIUsernameQueryMock = require('../../../functional/fixtures/mocks/github/users-username')
require('models/redis')

var randomInt = function () {
  return Math.floor(Math.random() * 1000)
}

var mongooseControl = require('models/mongo/mongoose-control.js')
describe('User Integration Tests', function () {
  var user
  var email
  var name
  var username
  var githubId

  function createNewUser (done) {
    email = Faker.Internet.email()
    name = Faker.Name.findName()
    username = Faker.Helpers.slugify(Faker.Internet.userName())
    githubId = randomInt()
    function createNewUserModel () {
      return new User({
        email: email,
        name: name,
        company: Faker.Company.companyName(),
        accounts: {
          github: {
            id: githubId,
            accessToken: randomInt() + '',
            refreshToken: randomInt() + '',
            username: username,
            emails: Faker.Internet.email(),
            avatar_url: 'fasdfasdfadsfadsfadsf',
            login: username
          }
        }
      })
    }
    user = createNewUserModel()
    user.save(done)
  }

  before(mongooseControl.start)

  after(require('../../../functional/fixtures/clean-mongo').removeEverything)

  beforeEach(createNewUser)
  afterEach(function (done) {
    nock.cleanAll()
    done()
  })

  after(mongooseControl.stop)

  describe('findByGithubUsername', function () {
    it('should have a `findByGithubUsername`', function (done) {
      expect(true).to.equal(true)
      expect(user.findByGithubUsername).to.be.a.function()
      done()
    })

    it('should return an empty list if no user exists', function (done) {
      var nonexistantUsername = 'user-that-doesnt-exist'
      githubAPIUsernameQueryMock(1, nonexistantUsername, { returnEmpty: true })
      user.findByGithubUsername(nonexistantUsername, function (err, res) {
        if (err) { return done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(0)
        done()
      })
    })

    it('should find a user from GitHub', function (done) {
      githubAPIUsernameQueryMock(githubId, username)
      user.findByGithubUsername(username, function (err, res) {
        if (err) { return done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(1)
        expect(res[0]).to.be.an.object()
        expect(res[0].accounts.github.id).to.equal(githubId)
        expect(res[0].accounts.github.username).to.equal(username)
        done()
      })
    })
  })
})
