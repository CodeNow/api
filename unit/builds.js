var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');

var Build = require('models/mongo/build');

describe('Build', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewBuild() {
    return new Build({
      owner: validation.VALID_OBJECT_ID,
      project: validation.VALID_OBJECT_ID,
      environment: validation.VALID_OBJECT_ID,
      contexts: [validation.VALID_OBJECT_ID],
      contextVersions: [validation.VALID_OBJECT_ID],
      created: Date.now() - 60000,
      createdBy: validation.VALID_OBJECT_ID
    });
  }

  it('should be able to save a build!', function (done) {
    var instance = createNewBuild();
    instance.save(function (err, instance) {
      if (err) { done(err); }
      else {
        expect(instance).to.be.okay;
        done();
      }
    });
  });

  describe('Owner Id Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'owner');
    validation.requiredValidationChecking(createNewBuild, 'owner');
  });

  describe('CreatedBy Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'createdBy');
    validation.requiredValidationChecking(createNewBuild, 'createdBy');
  });

  describe('Project Id Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'project');
    validation.requiredValidationChecking(createNewBuild, 'project');
  });

  describe('Environment Id Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'environment');
    validation.requiredValidationChecking(createNewBuild, 'environment');
  });

  describe('Context Ids Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'contexts', true);
    validation.requiredValidationChecking(createNewBuild, 'contexts');
  });

  describe('Version Ids Validation', function () {
    validation.objectIdValidationChecking(createNewBuild, 'contextVersions', true);
    validation.requiredValidationChecking(createNewBuild, 'contextVersions');
  });

});
