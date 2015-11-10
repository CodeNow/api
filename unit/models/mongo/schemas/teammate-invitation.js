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
        github: {
          id: validation.VALID_GITHUB_ID,
        },
        email: Faker.Internet.email(),
      },
      createdBy: validation.VALID_OBJECT_ID,
      created: Date.now(),
      organization: {
        github: {
          id: validation.VALID_GITHUB_ID,
        }
      }
    });
  }

  describe('GithubUserID Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'recipient.github.id');
    validation.githubUserRefValidationChecking(createNewInvite, 'recipient.github.id');
  });

  describe('Email Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'recipient.email');
    validation.emailValidationChecking(createNewInvite, 'recipient.email');
  });

  describe('CreatedBy Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'createdBy');
    validation.objectIdValidationChecking(createNewInvite, 'createdBy');
  });

  describe('OrgName Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'organization.github.id');
    validation.githubUserRefValidationChecking(createNewInvite, 'organization.github.id');
  });

});
