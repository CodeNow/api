/**
 * @module unit/models/mongo/schemas/user
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var Faker = require('faker')
var lab = exports.lab = Lab.script()

var describe = lab.describe
var it = lab.it
var expect = Code.expect
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach

var validation = require('../../../fixtures/validation')(lab)
var mongooseControl = require('models/mongo/mongoose-control.js')
var UserSchema = require('models/mongo/schemas/user')
var User = require('models/mongo/user')

describe('User Schema Integration Tests', function () {
  before(mongooseControl.start)

  afterEach(function (done) {
    User.remove({}, done)
  })

  after(function (done) {
    User.remove({}, done)
  })
  after(mongooseControl.stop)

  describe('_transformToJSON', function () {
    it('should strip sensitive properties', function (done) {
      var ret = {
        accounts: {
          github: {
            accessToken: '12345',
            _json: {},
            _raw: {},
            refreshToken: '123'
          }
        }
      }
      var res = UserSchema._transformToJSON({}, ret)
      expect(res.accounts.github.accessToken).to.not.exist()
      expect(res.accounts.github._json).to.not.exist()
      expect(res.accounts.github._raw).to.not.exist()
      expect(res.accounts.github.refreshToken).to.not.exist()
      done()
    })
  })
  function createNewUser () {
    return new User({
      email: Faker.Internet.email(),
      accounts: {
        github: {
          username: 'test',
          accessToken: 'test',
          refreshToken: 'test',
          id: 'test',
          _json: {},
          emails: [Faker.Internet.email(), Faker.Internet.email()]
        }
      },
      show_email: false,
      created: Date.now(),
      context: validation.VALID_OBJECT_ID,
      files: [{
        Key: 'test',
        ETag: 'test',
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerImage: 'testing',
        dockerTag: 'adsgasdfgasdf'
      }
    })
  }

  describe('Email Validation', function () {
    validation.emailValidationChecking(createNewUser, 'email')
    validation.requiredValidationChecking(createNewUser, 'email')
  })

  describe('Gravatar Validation', function () {
    validation.urlValidationChecking(createNewUser, 'gravatar', 'gravatar')
  })
})
