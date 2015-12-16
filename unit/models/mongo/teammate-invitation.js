/**
 * @module unit/models/mongo/schemas/teammateInivitation
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var path = require('path')
var async = require('async')

var lab = exports.lab = Lab.script()
var Faker = require('faker')

var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var expect = Code.expect

var validation = require('../../fixtures/validation')(lab)

var User = require('models/mongo/user')
var TeammateInvitation = require('models/mongo/teammate-invitation')
var randomInt = function () {
  return Math.floor(Math.random() * 1000)
}

var moduleName = path.relative(process.cwd(), __filename)
describe('TeammateInvitation: ' + moduleName, function () {
  before(require('../../fixtures/mongo').connect)
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything)
  var user

  beforeEach(function (done) {
    function createNewUser () {
      return new User({
        email: Faker.Internet.email(),
        name: Faker.Name.findName(),
        company: Faker.Company.companyName(),
        accounts: {
          github: {
            id: randomInt(),
            accessToken: randomInt() + '',
            refreshToken: randomInt() + '',
            username: Faker.Helpers.slugify(Faker.Internet.userName()),
            emails: Faker.Internet.email()
          }
        }
      })
    }
    function createNewInvite (orgGithubID, userGithubId) {
      return new TeammateInvitation({
        recipient: {
          github: validation.VALID_GITHUB_ID,
          email: Faker.Internet.email()
        },
        owner: {
          github: userGithubId
        },
        created: Date.now(),
        organization: {
          github: orgGithubID
        }
      })
    }
    user = createNewUser()
    var invite1 = createNewInvite(1, user.accounts.github.id)
    var invite2 = createNewInvite(2, user.accounts.github.id)
    async.waterfall([
      user.save.bind(user),
      function (res, index, cb) {
        async.parallel([
          invite1.save.bind(invite1),
          invite2.save.bind(invite2)
        ], cb)
      }
    ], done)
  })

  describe('findByGithubOrg', function () {
    it('should fetch all inivitations within a particular org', function (done) {
      TeammateInvitation.findByGithubOrg(1, function (err, result) {
        if (err) {
          return done(err)
        }
        expect(result).to.have.length(1)
        expect(result[0]).to.be.an.object()
        expect(result[0].organization).to.be.an.object()
        expect(result[0].organization.github).to.be.a.number()
        expect(result[0].organization.github).to.equal(1)
        done()
      })
    })

    it('should populate the `owner` field witht the respective model', function (done) {
      TeammateInvitation.findByGithubOrg(1, function (err, result) {
        if (err) {
          return done(err)
        }
        expect(result).to.have.length(1)
        expect(result[0]).to.be.an.object()
        expect(result[0].owner).to.be.an.object()
        expect(result[0].owner.github).to.be.a.number()
        expect(result[0].owner.github).to.equal(user.accounts.github.id)
        done()
      })
    })
  })
})
