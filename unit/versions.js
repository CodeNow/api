'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');

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
    var version = createNewVersion();
    version.save(function (err, version) {
      if (err) { done(err); }
      else {
        expect(version).to.be.okay;
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

  describe('Build Validation', function () {
    describe('Message', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.message', 500);
    });
    describe('Docker Image', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerImage', 200);
    });
    describe('Docker Tag', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerTag', 500);
    });
  });
});
