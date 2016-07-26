/**
 * @module unit/models/mongo/schemas/userwhitelist
 */
'use strict'

var Code = require('code')
var Lab = require('lab')

var lab = exports.lab = Lab.script()

var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var expect = Code.expect
var sinon = require('sinon')

var Github = require('models/apis/github')
var UserWhitelist = require('models/mongo/user-whitelist')

var mongooseControl = require('models/mongo/mongoose-control.js')

var accessToken = '123'
var githubOrgs

describe('UserWhitelist Model Integration Tests', function () {
  before(mongooseControl.start)
  afterEach(function (done) {
    UserWhitelist.remove({}, done)
  })

  after(function (done) {
    UserWhitelist.remove({}, done)
  })
  after(mongooseControl.stop)

  beforeEach(function (done) {
    githubOrgs = [
      {
        login: 'Runnable',
        id: 2828361,
        url: 'https://api.github.com/orgs/github',
        avatar_url: 'https://github.com/images/error/octocat_happy.gif'
      }, {
        login: 'NotRunnable',
        id: 2828362
      }
    ]
    var whitelistedOrgsCollection = [
      {
        name: 'Runnable',
        lowerName: 'runnable',
        allowed: true,
        _doc: {}
      }
    ]
    sinon.stub(Github.prototype, 'getUserAuthorizedOrgs').yieldsAsync(null, githubOrgs)
    sinon.stub(UserWhitelist, 'find').yieldsAsync(null, whitelistedOrgsCollection)
    done()
  })
  afterEach(function (done) {
    UserWhitelist.find.restore()
    Github.prototype.getUserAuthorizedOrgs.restore()
    done()
  })

  describe('getWhitelistedUsersForGithubUser', function () {
    it('should get all orgs that GH authorizes the user to see', function (done) {
      UserWhitelist.getWhitelistedUsersForGithubUser(accessToken, function (err, orgs) {
        if (err) done(err)
        sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgs)
        sinon.assert.calledOnce(UserWhitelist.find)
        sinon.assert.calledWithExactly(
          UserWhitelist.find,
          {
            'lowerName': { $in: ['runnable', 'notrunnable'] }
          },
          sinon.match.func
        )
        expect(err).to.not.exist()
        expect(orgs).to.be.an.array()
        expect(orgs.length).to.equal(1)
        expect(orgs[0].name).to.equal('Runnable')
        done()
      })
    })

    it('should get return the github orgs as part of the object', function (done) {
      UserWhitelist.getWhitelistedUsersForGithubUser(accessToken, function (err, orgs) {
        if (err) done(err)
        expect(err).to.not.exist()
        expect(orgs).to.be.an.array()
        expect(orgs.length).to.equal(1)
        expect(orgs[0].name).to.equal('Runnable')
        expect(orgs[0]._doc.org).to.equal(githubOrgs[0])
        done()
      })
    })

    it('should return an empty array if not orgs were found', function (done) {
      Github.prototype.getUserAuthorizedOrgs.yieldsAsync(null, [{
        login: 'NotRunnable'
      }])
      UserWhitelist.find.yieldsAsync(null, [])

      UserWhitelist.getWhitelistedUsersForGithubUser(accessToken, function (err, orgs) {
        if (err) done(err)
        sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgs)
        sinon.assert.calledOnce(UserWhitelist.find)
        sinon.assert.calledWithExactly(
          UserWhitelist.find,
          {
            'lowerName': { $in: ['notrunnable'] }
          },
          sinon.match.func
        )
        expect(err).to.not.exist()
        expect(orgs).to.be.an.array()
        expect(orgs.length).to.equal(0)
        done()
      })
    })

    it('should throw an error if it cant get the authorized orgs from GH', function (done) {
      Github.prototype.getUserAuthorizedOrgs.yieldsAsync(new Error('could not fetch github error'), null)
      UserWhitelist.getWhitelistedUsersForGithubUser(accessToken, function (err, orgs) {
        expect(err).to.exist()
        expect(err.message).to.match(/github.*error/i)
        expect(orgs).to.not.exist()
        done()
      })
    })

    it('should throw an error if no acess token is provided', function (done) {
      UserWhitelist.getWhitelistedUsersForGithubUser(null, function (err, orgs) {
        expect(err).to.exist()
        expect(err.message).to.match(/access.*token.*provided/i)
        expect(orgs).to.not.exist()
        done()
      })
    })
  })
})
