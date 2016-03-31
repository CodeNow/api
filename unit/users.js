'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var afterEach = lab.afterEach

var Faker = require('faker')
var validation = require('./fixtures/validation')(lab)
// var schemaValidators = require('../lib/models/mongo/schemas/schema-validators')

var User = require('models/mongo/user')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('User :' + moduleName, function () {
  before(require('./fixtures/mongo').connect)
  afterEach(require('../test/functional/fixtures/clean-mongo').removeEverything)

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

//  describe('Accounts Validation', function() {
//    describe('Github Username Validation', function () {
//      validation.urlSafeNameValidationChecking(createNewUser, 'accounts.github.username',
//        schemaValidators.validationMessages.characters)
//      validation.requiredValidationChecking(createNewUser, 'accounts.github.username')
//    })
//    describe('Github Token Validation', function () {
//      validation.tokenValidationChecking(createNewUser, 'accounts.github.accessToken',
//        schemaValidators.validationMessages.characters)
//      validation.requiredValidationChecking(createNewUser, 'accounts.github.accessToken')
//    })
//    describe('Github Email Validation', function () {
//      validation.tokenValidationChecking(createNewUser, 'accounts.github.emails', true)
//      validation.requiredValidationChecking(createNewUser, 'accounts.github.emails')
//    })
//  })
})
