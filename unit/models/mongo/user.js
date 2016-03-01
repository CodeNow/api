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
var sinon = require('sinon')
var Github = require('models/apis/github')

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
        expect(res[0].accounts.github.id).to.equal(githubId)
        expect(res[0].accounts.github.username).to.equal(username)
        done()
      })
    })
  })

  describe('anonymousFindGithubUserByGithubId', function () {
    var mockResponse = {
      login: 'nathan219',
      avatar_url: 'testingtesting123'
    }
    beforeEach(function (done) {
      sinon.stub(Github.prototype, 'getUserById').yieldsAsync(null, mockResponse)
      done()
    })
    afterEach(function (done) {
      Github.prototype.getUserById.restore()
      done()
    })
    it('should just fetch the user from the database', function (done) {
      var userJson = user.toJSON()
      delete userJson.password
      User.anonymousFindGithubUserByGithubId(user.accounts.github.id, function (err, userFromDb) {
        if (err) { done(err) }
        sinon.assert.notCalled(Github.prototype.getUserById)
        expect(userFromDb).to.deep.equal(userJson)
        done()
      })
    })
    it('should fetch from github when the result isn\'t in the database', function (done) {
      var userJson = user.toJSON()
      delete userJson.password
      User.anonymousFindGithubUserByGithubId('123123123', function (err, userFromMock) {
        if (err) { done(err) }
        sinon.assert.calledOnce(Github.prototype.getUserById)
        expect(userFromMock).to.deep.equal(mockResponse)
        done()
      })
    })
  })
  describe('findGithubOrgMembersByOrgName', function () {
    it('should have a `findByGithubOrgMembersByOrgName` method', function (done) {
      expect(user.findGithubOrgMembersByOrgName).to.be.a.function()
      done()
    })

    it('should return an empty list if no user exists', function (done) {
      githubAPIOrgMembersMock('empty-org', githubId, username, { returnEmpty: true })
      user.findGithubOrgMembersByOrgName('empty-org', function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(0)
        done()
      })
    })

    it('should return an array of found users', function (done) {
      githubAPIOrgMembersMock(orgName, githubId, username)
      user.findGithubOrgMembersByOrgName(orgName, function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.greaterThan(0)
        res.forEach(function (member) {
          expect(member).to.be.an.object()
          expect(member.accounts).to.be.an.object()
          expect(member.accounts.github).to.be.an.object()
          expect(member.accounts.github.id).to.be.a.number()
          expect(member.accounts.github.username).to.be.a.string()
        })
        var runnableUser = res.filter(function (member) {
          return member.accounts.github.username === username
        })[0]
        expect(runnableUser).to.be.an.object()
        expect(runnableUser.accounts.github.id).to.equal(githubId)
        expect(runnableUser.accounts.github.username).to.equal(username)
        done()
      })
    })
  })

  describe('findUsersByGithubOrgNameOrUsername', function () {
    beforeEach(function (done) {
      githubAPIOrgMembersMock('empty-org', githubId, username, { returnEmpty: true })
      githubAPIOrgMembersMock(orgName, githubId, username)
      done()
    })

    it('should have a `findUsersByGithubOrgNameOrUsername` method', function (done) {
      expect(user.findUsersByGithubOrgNameOrUsername).to.be.a.function()
      done()
    })

    it('should throw an error if the parameter passed is not an object', function (done) {
      user.findUsersByGithubOrgNameOrUsername(null, function (err, res) {
        expect(err).to.be.an.object()
        expect(err.output).to.be.an.object()
        expect(err.output.statusCode).to.be.a.number()
        expect(err.output.statusCode).to.equal(400)
        expect(err.message).to.be.a.string()
        expect(err.message).to.be.match(/must be an object/)
        done()
      })
    })

    it('should throw an error if no query options are passed to it', function (done) {
      user.findUsersByGithubOrgNameOrUsername({}, function (err, res) {
        expect(err).to.be.an.object()
        expect(err.output).to.be.an.object()
        expect(err.output.statusCode).to.be.a.number()
        expect(err.output.statusCode).to.equal(400)
        expect(err.message).to.be.a.string()
        expect(err.message).to.be.match(/enough parameters/)
        done()
      })
    })

    it('should throw an error if both query options are passed', function (done) {
      user.findUsersByGithubOrgNameOrUsername({ githubUsername: username, githubOrgName: orgName }, function (err, res) {
        expect(err).to.be.an.object()
        expect(err.output).to.be.an.object()
        expect(err.output.statusCode).to.be.a.number()
        expect(err.output.statusCode).to.equal(400)
        expect(err.message).to.be.a.string()
        expect(err.message).to.be.match(/must contain only/)
        done()
      })
    })

    it('should find a user when passed a `githubUsername`', function (done) {
      githubAPIUsernameQueryMock(githubId, username)
      user.findUsersByGithubOrgNameOrUsername({ githubUsername: username }, function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.equal(1)
        expect(res[0]).to.be.an.object()
        expect(res[0].name).to.equal(name)
        expect(res[0].accounts.github.id).to.equal(githubId)
        expect(res[0].accounts.github.username).to.equal(username)
        done()
      })
    })

    it('should find a all users in an org when passed a `githubOrgName`', function (done) {
      user.findUsersByGithubOrgNameOrUsername({ githubOrgName: orgName }, function (err, res) {
        if (err) { done(err) }
        expect(res).to.be.an.array()
        expect(res.length).to.greaterThan(0)
        res.forEach(function (member) {
          expect(member).to.be.an.object()
          expect(member.accounts).to.be.an.object()
          expect(member.accounts.github).to.be.an.object()
          expect(member.accounts.github.id).to.be.a.number()
          expect(member.accounts.github.username).to.be.a.string()
        })
        var runnableUser = res.filter(function (member) {
          return member.accounts.github.username === username
        })[0]
        expect(runnableUser).to.be.an.object()
        expect(runnableUser.accounts.github.id).to.equal(githubId)
        expect(runnableUser.accounts.github.username).to.equal(username)
        done()
      })
    })
  })
})
