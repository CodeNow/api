/**
 * @module unit/models/mongo/schemas/teammateInivitation
 */
'use strict';

var Lab = require('lab');
var path = require('path');

var lab = exports.lab = Lab.script();
var Faker = require('faker');

var describe = lab.describe;
var before = lab.before;
var afterEach = lab.afterEach;

var validation = require('../../../fixtures/validation')(lab);

var TeammateInvitation = require('models/mongo/teammate-invitation');

var moduleName = path.relative(process.cwd(), __filename);
describe('TeammateInvitation Schema: ' + moduleName, function () {

  before(require('../../../fixtures/mongo').connect);
  afterEach(require('../../../../test/functional/fixtures/clean-mongo').removeEverything);

  function createNewInvite () {
    return new TeammateInvitation({
      recipient: {
        github: validation.VALID_GITHUB_ID,
        email: Faker.Internet.email()
      },
      sender: validation.VALID_OBJECT_ID,
      created: Date.now(),
      organization: {
        github: validation.VALID_GITHUB_ID,
      }
    });
  }

  describe('GithubUserID Validation', function () {
    validation.githubUserRefValidationChecking(createNewInvite, 'recipient.github');
  });

  describe('Email Validation', function () {
    validation.emailValidationChecking(createNewInvite, 'recipient.email');
  });

  describe('Sender Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'sender');
    validation.objectIdValidationChecking(createNewInvite, 'sender');
  });

  describe('OrgName Validation', function () {
    validation.githubUserRefValidationChecking(createNewInvite, 'organization.github');
  });

});
