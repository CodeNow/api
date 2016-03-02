/**
 * @module integrations/models/mongo/user
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

var moduleName = path.relative(process.cwd(), __filename)
var mongooseControl = require('models/mongo/mongoose-control.js')

var randomInt = function () {
  return Math.floor(Math.random() * 1000)
}

describe('User ' + moduleName, function () {
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
          github: getUserResult(githubId, username)
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
      User.anonymousFindGithubUserByGithubId(user.accounts.github.id, function (err, userFromDb) {
        if (err) { done(err) }
        sinon.assert.notCalled(Github.prototype.getUserById)
        expect(userFromDb.login, 'login').to.exist()
        expect(userFromDb.login, 'login').to.equal(username)
        expect(userFromDb.avatar_url, 'avatar_url').to.exist()
        expect(userFromDb.avatar_url, 'avatar_url').to.equal('https://avatars.githubusercontent.com/u/160236?v=3')
        done()
      })
    })
    it('should fetch from github when the result isn\'t in the database', function (done) {
      User.anonymousFindGithubUserByGithubId('123123123', function (err, userFromMock) {
        if (err) { done(err) }
        sinon.assert.calledOnce(Github.prototype.getUserById)
        expect(userFromMock).to.deep.equal(mockResponse)
        done()
      })
    })
  })
})
function getUserResult (userId, username) {
  return {
    'refreshToken': null,
    'accessToken': '45e26a124605430ed829a31a8847b890606d944b',
    '_json': {
      'updated_at': '2016-01-22T18:58:46Z',
      'created_at': '2009-12-01T06:50:11Z',
      'following': 3,
      'followers': 14,
      'public_gists': 2,
      'public_repos': 33,
      'bio': null,
      'hireable': null,
      'email': null,
      'location': 'San Francisco, CA',
      'blog': 'bryankendall.com',
      'company': 'Runnable.com',
      'name': 'Bryan Kendall',
      'site_admin': false,
      'type': 'User',
      'received_events_url': 'https://api.github.com/users/' + username + '/received_events',
      'events_url': 'https://api.github.com/users/' + username + '/events{/privacy}',
      'repos_url': 'https://api.github.com/users/' + username + '/repos',
      'organizations_url': 'https://api.github.com/users/' + username + '/orgs',
      'subscriptions_url': 'https://api.github.com/users/' + username + '/subscriptions',
      'starred_url': 'https://api.github.com/users/' + username + '/starred{/owner}{/repo}',
      'gists_url': 'https://api.github.com/users/' + username + '/gists{/gist_id}',
      'following_url': 'https://api.github.com/users/' + username + '/following{/other_user}',
      'followers_url': 'https://api.github.com/users/' + username + '/followers',
      'html_url': 'https://github.com/' + username,
      'url': 'https://api.github.com/users/' + username,
      'gravatar_id': '',
      'avatar_url': 'https://avatars.githubusercontent.com/u/160236?v=3',
      'id': userId,
      'login': username
    },
    'emails': [
      {
        'value': null
      }
    ],
    'profileUrl': 'https://github.com/' + username,
    'username': username,
    'displayName': 'Bryan Kendall',
    'id': userId,
    'provider': 'github'
  }
}
