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
var githubAPIOrgMembersMock = require('../../../test/functional/fixtures/mocks/github/org-members')
require('../../../lib/models/redis')

var moduleName = path.relative(process.cwd(), __filename)

var randomInt = function () {
  return Math.floor(Math.random() * 1000)
}

describe('User ' + moduleName, function () {
  var user
  var email
  var name
  var username
  var githubId
  var orgName

  function createNewUser (done) {
    email = Faker.Internet.email()
    name = Faker.Name.findName()
    username = Faker.Helpers.slugify(Faker.Internet.userName())
    orgName = Faker.Helpers.slugify(Faker.Internet.userName())
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
            emails: Faker.Internet.email()
          }
        }
      })
    }
    user = createNewUserModel()
    user.save(done)
  }

  before(require('../../fixtures/mongo').connect)
  after(require('../../../test/functional/fixtures/clean-mongo').removeEverything)

  beforeEach(createNewUser)
  afterEach(function (done) {
    nock.cleanAll()
    done()
  })

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

    beforeEach(createNewUser)
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
      var nonexistantUsername = 'user-that-doesnt-exist'
      githubAPIUsernameQueryMock(1, nonexistantUsername, { returnEmpty: true })
      user.findByGithubUsername(nonexistantUsername, function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(0)
        done()
      })
    })

    it('should find a user from GitHub', function (done) {
      githubAPIUsernameQueryMock(githubId, username)
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

  describe('findGithubOrgMembersByOrgName', function () {
    beforeEach(function (done) {
      githubAPIOrgMembersMock('empty-org', githubId, username, { returnEmpty: true })
      githubAPIOrgMembersMock(orgName, githubId, username)
      done()
    })

    it('should have a `findByGithubOrgMembersByOrgName` method', function (done) {
      expect(user.findGithubOrgMembersByOrgName).to.be.a.function()
      done()
    })

    it('should return an empty list if no user exists', function (done) {
      user.findGithubOrgMembersByOrgName('empty-org', function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(0)
        done()
      })
    })

    it('should return an array of found users', function (done) {
      user.findGithubOrgMembersByOrgName(orgName, function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.greaterThan(0)
        res.forEach(function (member) {
          expect(member).to.be.an.object()
          expect(member.login).to.be.a.string()
          expect(member.id).to.be.a.number()
        })
        var user = res.filter(function (member) {
          return member.login === username
        })[0]
        expect(user.login).to.equal(username)
        expect(user.runnableUser).to.be.an.object()
        expect(user.runnableUser.accounts.github).to.be.an.object()
        expect(user.runnableUser.accounts.github.id).to.be.a.number()
        expect(user.runnableUser.accounts.github.username).to.be.a.string()
        expect(user.runnableUser.accounts.github.id).to.equal(githubId)
        expect(user.runnableUser.accounts.github.username).to.equal(username)
        done()
      })
    })
  })
})
