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
require('sinon-as-promised')(require('bluebird'))

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
      User.findOneAsync.restore()
      done()
    })
    it('should just fetch the user from the database, and skip github', function (done) {
      user._json = {
        avatar_url: '111',
        login: '222'
      }
      sinon.stub(User, 'findOneAsync').resolves(user)
      User.anonymousFindGithubUserByGithubId(user.accounts.github.id, function (err) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(User.findOneAsync)
        sinon.assert.notCalled(Github.prototype.getUserById)
        done()
      })
    })
    it('should just fetch the user from the database\'s _json object', function (done) {
      user.accounts.github._json = {
        avatar_url: '111',
        login: '222'
      }
      sinon.stub(User, 'findOneAsync').resolves(user)
      User.anonymousFindGithubUserByGithubId(user.accounts.github.id, function (err, userFromDb) {
        if (err) { return done(err) }
        expect(userFromDb.login, 'login').to.exist()
        expect(userFromDb.login, 'login').to.equal('222')
        expect(userFromDb.avatar_url, 'avatar_url').to.exist()
        expect(userFromDb.avatar_url, 'avatar_url').to.equal('111')
        done()
      })
    })
    it('should just fetch the user from the database account.github', function (done) {
      sinon.stub(User, 'findOneAsync').resolves(user)
      User.anonymousFindGithubUserByGithubId(user.accounts.github.id, function (err, userFromDb) {
        if (err) { return done(err) }
        expect(userFromDb.login, 'login').to.exist()
        expect(userFromDb.login, 'login').to.equal(username)
        expect(userFromDb.avatar_url, 'avatar_url').to.exist()
        expect(userFromDb.avatar_url, 'avatar_url').to.equal('fasdfasdfadsfadsfadsf')
        done()
      })
    })
    it('should fetch from github when the result isn\'t in the database', function (done) {
      sinon.stub(User, 'findOneAsync').resolves()
      User.anonymousFindGithubUserByGithubId('123123123', function (err, userFromMock) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(User.findOneAsync)
        sinon.assert.calledOnce(Github.prototype.getUserById)
        expect(userFromMock).to.deep.equal(mockResponse)
        done()
      })
    })
    it('should fetch from github when the database query fails', function (done) {
      sinon.stub(User, 'findOneAsync').rejects(new Error('hello'))
      User.anonymousFindGithubUserByGithubId('123123123', function (err, userFromMock) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(User.findOneAsync)
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
