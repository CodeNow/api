var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var Faker = require('faker');
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');

var Container = require('../lib/models/mongo/container');

describe('Containers', function () {
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

  it('should be able to save a project!', function (done) {
    this.container = createNewContainer();
    this.container.save(function (err, container) {
      if (err) { done(err); }
      else {
        expect(container).to.be.okay;
        done();
      }
    });
  });

  describe('Name Validation', function () {
    validation.NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var container = createNewContainer();
        container.name = string;
        validation.errorCheck(container, done, 'name', schemaValidators.validationMessages.characters);
      });
    });
    validation.ALPHA_NUM_NOSPACE_SAFE.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var container = createNewContainer();
        container.name = string;
        validation.successCheck(container, done, 'name');
      });
    });
    validation.stringLengthValidationChecking(createNewContainer, 'name', 100);
  });

  describe('Context Validation', function () {
    validation.objectIdValidationChecking(createNewContainer, 'context');
    validation.requiredValidationChecking(createNewContainer, 'context');
  });

  describe('Version Validation', function () {
    validation.objectIdValidationChecking(createNewContainer, 'version');
    validation.requiredValidationChecking(createNewContainer, 'version');
  });

  describe('Docker Container Validation', function () {
    validation.dockerIdValidationChecking(createNewContainer, 'dockerContainer');
    validation.requiredValidationChecking(createNewContainer, 'dockerContainer');
  });

  describe('Docker Host Validation', function () {
    validation.urlValidationChecking(createNewContainer, 'dockerHost', schemaValidators.validationMessages.dockerHost);
    validation.requiredValidationChecking(createNewContainer, 'dockerHost');
  });

});
