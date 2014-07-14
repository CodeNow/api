var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var Faker = require('faker');
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');

var Instance = require('models/mongo/instance');
var Container = require('../lib/models/mongo/container');

describe('Instance', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewContainer() {
    return new Container({
      name: 'name',
      context: validation.VALID_OBJECT_ID,
      version: validation.VALID_OBJECT_ID,
      created: Date.now(),
      dockerHost: Faker.Image.imageUrl(),
      dockerContainer: validation.VALID_OBJECT_ID
    });
  }

  function createNewInstance() {
    return new Instance({
      name: 'name',
      public: false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      project: validation.VALID_OBJECT_ID,
      environment: validation.VALID_OBJECT_ID,
      created: Date.now(),
      containers: [createNewContainer()],
      outputViews: [{
        name: "testOutputView",
        type: "test"
      }]
    });
  }

  it('should be able to save a instance!', function (done) {
    var instance = createNewInstance();
    instance.save(function (err, instance) {
      if (err) { done(err); }
      else {
        expect(instance).to.be.okay;
        done();
      }
    });
  });
  describe('Name Validation', function () {
    validation.NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var instance = createNewInstance();
        instance.name = string;
        validation.errorCheck(instance, done, 'name', schemaValidators.validationMessages.characters);
      });
    });
    validation.ALPHA_NUM_SAFE.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var instance = createNewInstance();
        instance.name = string;
        validation.successCheck(instance, done, 'name');
      });
    });
    validation.stringLengthValidationChecking(createNewInstance, 'name', 100);
    validation.requiredValidationChecking(createNewInstance, 'name');
  });

  describe('Github Owner Id Validation', function () {
    validation.githubUserRefValidationChecking(createNewInstance, 'owner.github');
    validation.requiredValidationChecking(createNewInstance, 'owner');
  });

  describe('Github CreatedBy Validation', function () {
    validation.githubUserRefValidationChecking(createNewInstance, 'createdBy.github');
    validation.requiredValidationChecking(createNewInstance, 'createdBy');
  });

  describe('Project Id Validation', function () {
    validation.objectIdValidationChecking(createNewInstance, 'project');
    validation.requiredValidationChecking(createNewInstance, 'project');
  });

  describe('Environment Id Validation', function () {
    validation.objectIdValidationChecking(createNewInstance, 'environment');
    validation.requiredValidationChecking(createNewInstance, 'environment');
  });

  describe('OutputViews Validation', function () {
    describe('Name', function () {
      validation.alphaNumNameValidationChecking(createNewInstance, 'outputViews.0.name');
    });
    describe('Type', function () {
      validation.alphaNumNameValidationChecking(createNewInstance, 'outputViews.0.type');
    });
  });

});
