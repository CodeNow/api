'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var Faker = require('faker');
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');

var User = require('models/mongo/user');

describe('User', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewUser() {
    return new User({
      email: Faker.Internet.email(),
      password: "pass",
      name: "test",
      accounts: {
        github: {
          username: 'test'
        }
      },
      show_email: false,
      created: Date.now(),
      context: validation.VALID_OBJECT_ID,
      files:[{
        Key: "test",
        ETag: "test",
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerImage: "testing",
        dockerTag: "adsgasdfgasdf"
      }
    });
  }

  it('should be able to save a user!', function (done) {
    var user = createNewUser();
    user.save(function (err, instance) {
      if (err) { done(err); }
      else {
        expect(instance).to.be.okay;
        done();
      }
    });
  });

  describe('Email Validation', function () {
    validation.ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var user = createNewUser();
        validation.fixArrayKeypathSet(user, "email", string);
        validation.errorCheck(user, done, "email", schemaValidators.validationMessages.email);
      });
    });
    var validEmail = Faker.Internet.email();
    it('should pass validation for a valid email (' + validEmail + ')', function (done) {
      var user = createNewUser();
      validation.fixArrayKeypathSet(user, "email", validEmail);
      validation.successCheck(user, done, "email");
    });
    // FIXME: GROUPS DON'T REQUIRE AN EMAIL
    // validation.requiredValidationChecking(createNewUser, 'email');
  });

  describe('Name Validation', function () {
    validation.nameValidationChecking(createNewUser, 'name');
  });

  describe('Company Validation', function () {
    validation.nameValidationChecking(createNewUser, 'company');
  });

});
