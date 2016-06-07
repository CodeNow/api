/**
 * @module unit/models/mongo/schemas/teammateInivitation
 */
'use strict'

var Lab = require('lab')

var lab = exports.lab = Lab.script()
var Faker = require('faker')

var describe = lab.describe
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach

var validation = require('../../../fixtures/validation')(lab)

var mongooseControl = require('models/mongo/mongoose-control.js')

var TeammateInvitation = require('models/mongo/teammate-invitation')

describe('TeammateInvitation Schema Integration Tests', function () {
  before(mongooseControl.start)

  afterEach(function (done) {
    TeammateInvitation.remove({}, done)
  })

  after(function (done) {
    TeammateInvitation.remove({}, done)
  })
  after(mongooseControl.stop)

  function createNewInvite () {
    return new TeammateInvitation({
      recipient: {
        github: validation.VALID_GITHUB_ID,
        email: Faker.Internet.email()
      },
      owner: {
        github: validation.VALID_GITHUB_ID
      },
      created: Date.now(),
      organization: {
        github: validation.VALID_GITHUB_ID
      }
    })
  }

  describe('GithubUserID Validation', function () {
    validation.githubUserRefValidationChecking(createNewInvite, 'recipient.github')
  })

  describe('Email Validation', function () {
    validation.emailValidationChecking(createNewInvite, 'recipient.email')
  })

  describe('Owner Validation', function () {
    validation.githubUserRefValidationChecking(createNewInvite, 'owner.github')
  })

  describe('OrgName Validation', function () {
    validation.githubUserRefValidationChecking(createNewInvite, 'organization.github')
  })
})
