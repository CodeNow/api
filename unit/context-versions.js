'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');

var Version = require('models/mongo/context-version');

describe('Versions', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewVersion() {
    return new Version({
      message: "test",
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      config: validation.VALID_OBJECT_ID,
      created: Date.now(),
      environment: validation.VALID_OBJECT_ID,
      context: validation.VALID_OBJECT_ID,
      files:[{
        Key: "test",
        ETag: "test",
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerImage: "testing",
        dockerTag: "adsgasdfgasdf"
      },
      appCodeVersions: [{
        repo: 'bkendall/flaming-octo-nemisis'
      }]
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

  describe('Github Owner Id Validation', function () {
    validation.githubUserRefValidationChecking(createNewVersion, 'owner.github');
    validation.requiredValidationChecking(createNewVersion, 'owner');
  });

  describe('Context Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'context');
    validation.requiredValidationChecking(createNewVersion, 'context');
  });

  describe('Environment Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'environment');
    validation.requiredValidationChecking(createNewVersion, 'environment');
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
