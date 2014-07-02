var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var Faker = require('faker');
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');

var Version = require('models/mongo/version');

describe('Versions', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewVersion() {
    return new Version({
      message: "test",
      owner: validation.VALID_OBJECT_ID,
      createdBy: validation.VALID_OBJECT_ID,
      config: validation.VALID_OBJECT_ID,
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

  it('should be able to save a version!', function (done) {
    this.instance = createNewVersion();
    this.instance.save(function (err, instance) {
      if (err) { done(err); }
      else {
        expect(instance).to.be.okay;
        done();
      }
    });
  });

  describe('Owner Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'owner');
    validation.requiredValidationChecking(createNewVersion, 'owner');
  });

  describe('Context Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'context');
    validation.requiredValidationChecking(createNewVersion, 'context');
  });

  describe('Message Validation', function () {
    validation.stringLengthValidationChecking(createNewVersion, 'message', 500);
  });

  describe('Docker Image Validation', function () {
    validation.stringLengthValidationChecking(createNewVersion, 'dockerImage', 200);
  });
  describe('Docker Tag Validation', function () {
    validation.stringLengthValidationChecking(createNewVersion, 'dockerTag', 500);
  });
});
