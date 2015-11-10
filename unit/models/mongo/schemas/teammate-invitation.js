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
      githubUserId: validation.VALID_GITHUB_ID,
      createdBy: validation.VALID_OBJECT_ID,
      created: Date.now(),
      email: Faker.Internet.email(),
      orgName: 'CodeNow'
    });
  }

  describe('GithubUserID Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'githubUserId');
    validation.githubUserRefValidationChecking(createNewInvite, 'githubUserId');
  });

  describe('Email Validation', function () {
    validation.emailValidationChecking(createNewInvite, 'email');
    validation.requiredValidationChecking(createNewInvite, 'email');
  });

  describe('CreatedBy Validation', function () {
    validation.objectIdValidationChecking(createNewInvite, 'createdBy');
    validation.requiredValidationChecking(createNewInvite, 'createdBy');
  });

  describe('OrgName Validation', function () {
    validation.requiredValidationChecking(createNewInvite, 'orgName');
  });

});
