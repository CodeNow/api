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

var Environment = require('models/mongo/environment');

describe('Environments', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewEnvironment() {
    return new Environment({
      owner: validation.VALID_OBJECT_ID,
      name : "test"
    });
  }

  it('should be able to save a build!', function (done) {
    this.instance = createNewEnvironment();
    this.instance.save(function (err, instance) {
      if (err) { done(err); }
      else {
        expect(instance).to.be.okay;
        done();
      }
    });
  });

  describe('Owner Id Validation', function () {
    validation.objectIdValidationChecking(createNewEnvironment, 'owner');
    validation.requiredValidationChecking(createNewEnvironment, 'owner');
  });

  describe('Name Validation', function () {
    validation.alphaNumNameValidationChecking(createNewEnvironment, 'name');
  });
});
