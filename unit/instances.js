var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var Faker = require('faker');
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');
var Hashids = require('hashids');

var Instance = require('models/mongo/instance');
var Container = require('../lib/models/mongo/container');

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}
function getRandomHash() {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  return hashids.encrypt(getRandomInt(0, 1000))[0];
}

describe('Instance', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewContainer() {
    return new Container({
      name: 'name',
      shortHash: getRandomHash(),
      context: validation.VALID_OBJECT_ID,
      version: validation.VALID_OBJECT_ID,
      created: Date.now(),
      dockerHost: Faker.Image.imageUrl(),
      dockerContainer: validation.VALID_OBJECT_ID
    });
  }

  function createNewInstance(name) {
    return new Instance({
      name: name || 'name',
      shortHash: getRandomHash(),
      public: false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      build: validation.VALID_OBJECT_ID,
      created: Date.now(),
      containers: [createNewContainer()],
      network: {
        networkIp: '1.1.1.1',
        hostIp: '1.1.1.100'
      }
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
  it('should not save an instance with the same (lower) name and owner', function (done) {
    var instance = createNewInstance('hello');
    instance.save(function (err, instance) {
      if (err) {
        done(err);
      }
      else {
        expect(instance).to.be.okay;
        var newInstance = createNewInstance('Hello');
        newInstance.save(function (err, instance) {
          expect(instance).to.not.be.okay;
          expect(err).to.be.okay;
          expect(err.code).to.equal(11000);
          done();
        });
      }
    });
  });
  it('should not be able to save an instance with the same name and owner', function (done) {
    var instance = createNewInstance();
    instance.save(function (err, instance) {
      if (err) {
        done(err);
      }
      else {
        expect(instance).to.be.okay;
        var newInstance = createNewInstance();
        newInstance.save(function (err, instance) {
          expect(instance).to.not.be.okay;
          expect(err).to.be.okay;
          expect(err.code).to.equal(11000);
          done();
        });
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
});
