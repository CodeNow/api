var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');
var Context = require('models/mongo/context');

describe('Context Unit Testing', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewContext() {
    return new Context({
      name: 'name',
      description: 'description',
      public: false,
      version: [validation.VALID_OBJECT_ID],
      owner: validation.VALID_OBJECT_ID,
      source:[{
        sourceType: "test",
        location: "www.google.com"
      }],
      created: Date.now() - 60000
    });
  }

  it('should be able to save a context!', function (done) {
    var context = new Context({
      name: 'name',
      description: 'description',
      public: false,
      owner: validation.VALID_OBJECT_ID
    });
    context.save(function (err, context) {
      if (err) {
        done(err);
      }
      else {
        expect(context).to.be.okay;
        done();
      }
    });
  });
  describe('Contexts Name Validation', function () {
    validation.urlSafeNameValidationChecking(createNewContext, 'name',
      schemaValidators.validationMessages.characters);
    validation.requiredValidationChecking(createNewContext, 'name');
  });

  describe('Contexts Owner Validation', function () {
    validation.objectIdValidationChecking(createNewContext, 'owner');
  });

  describe('Contexts Description Validation', function () {
    validation.stringLengthValidationChecking(createNewContext, 'description', 500);
  });

  describe('Contexts Version Validation', function () {
    validation.objectIdValidationChecking(createNewContext, 'versions', true);
  });

  describe('Contexts Source Validation', function () {
    validation.alphaNumNameValidationChecking(createNewContext, 'source.0.sourceType');
    validation.urlValidationChecking(createNewContext, 'source.0.location',
      schemaValidators.validationMessages.url);
  });

});
