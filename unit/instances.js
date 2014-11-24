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

  function createNewInstance(name, dockerHost) {
    return new Instance({
      name: name || 'name',
      shortHash: getRandomHash(),
      public: false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      build: validation.VALID_OBJECT_ID,
      created: Date.now(),
      containers: [createNewContainer()],
      container: {
        dockerContainer: validation.VALID_OBJECT_ID,
        dockerHost: dockerHost || '192.0.0.1'
      },
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

  describe('find instance by container id', function () {
    var savedInstance = null;
    var instance = null;
    before(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance = instance;
          done();
        }
      });
    });

    it('should find an instance', function (done) {
      Instance.findByContainerId(savedInstance.container.dockerContainer, function (err, fetchedInstance) {
        if (err) { return done(err); }
        expect(String(fetchedInstance._id)).to.equal(String(instance._id));
        expect(fetchedInstance.name).to.equal(instance.name);
        expect(fetchedInstance.container.dockerContainer).to.equal(instance.container.dockerContainer);
        expect(fetchedInstance.public).to.equal(instance.public);
        expect(fetchedInstance.lowerName).to.equal(instance.lowerName);
        expect(String(fetchedInstance.build)).to.equal(String(instance.build));
        done();
      });
    });
  });

  describe('find instances by docker host', function () {
    var savedInstance = null;
    var instance = null;
    beforeEach(function (done) {
      instance = createNewInstance();
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance = instance;
          done();
        }
      });
    });

    it('should not find and intance for the host that doesnot exist', function (done) {
      Instance.findAllByDockerHost('10.0.0.1', function (err, instances) {
        if (err) { return done(err); }
        expect(instances.length).to.equal(0);
        done();
      });
    });

    it('should find one intance for the provided host', function (done) {
      Instance.findAllByDockerHost('192.0.0.1', function (err, instances) {
        if (err) { return done(err); }
        expect(instances.length).to.equal(1);
        done();
      });
    });

    it('should find two intances out of three that match provided docker host', function (done) {
      createNewInstance('instance2', '192.0.0.2').save(function (err) {
        if (err) { return done(err); }
        createNewInstance('instance3', '192.0.0.1').save(function (err) {
          Instance.findAllByDockerHost('192.0.0.1', function (err, instances) {
            if (err) { return done(err); }
            expect(instances.length).to.equal(2);
            done();
          });
        });
      });
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
