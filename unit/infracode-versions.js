var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var uuid = require('uuid');
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');

var InfracodeVersion = require('../lib/models/mongo/infra-code-version');

describe('Infracode Versions', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  function createNewInfracodeVersion(envId) {
    return new InfracodeVersion({
      context: validation.VALID_OBJECT_ID,
      parent: validation.VALID_OBJECT_ID,
      environment: envId,
      parentEnvironment: validation.VALID_OBJECT_ID,
      created: Date.now(),
      files:[{
        Key: "test",
        ETag: "test",
        VersionId: validation.VALID_OBJECT_ID
      }]
    });
  }

  it('should be able to save an Infracode version!', function (done) {
    var infracode = createNewInfracodeVersion();
    infracode.save(function (err, infracode) {
      if (err) { done(err); }
      else {
        expect(infracode).to.be.okay;
        done();
      }
    });
  });



  it('should be create a copy, and keep the originals env as its parentEnv', function (done) {
    var envId = '507c7f79bcf86cd7994f6c11';
    var infracode = createNewInfracodeVersion(envId);
    infracode.save(function (err, infracode) {
      var newEnvId = '507c7f79bcf86cd7994f6a11';
      InfracodeVersion.createCopyById(infracode._id, newEnvId, function(err, childInfracode) {
        if (err) { done(err); }
        expect(childInfracode).to.be.okay;
        expect(childInfracode.environment.toString()).to.equal(newEnvId);
        expect(childInfracode.parentEnvironment.toString()).to.equal(infracode.environment.toString());
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString());
        done();
      })
    });
  });

  it('should be create a copy, but not save the parentEnv since it did not change', function (done) {
    var envId = '507c7f79bcf86cd7994f6c11';
    var infracode = createNewInfracodeVersion(envId);
    infracode.save(function (err, infracode) {
      InfracodeVersion.createCopyById(infracode._id, envId, function(err, childInfracode) {
        if (err) { done(err); }
        expect(childInfracode).to.be.okay;
        expect(childInfracode.environment.toString()).to.equal(envId);
        expect(childInfracode.parentEnvironment).to.not.be.okay;
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString());
        done();
      })
    });
  });

  it('should be create a copy, but not save the parentEnv since it did not change', function (done) {
    var envId = '507c7f79bcf86cd7994f6c11';
    var infracode = createNewInfracodeVersion(envId);
    infracode.save(function (err, infracode) {
      InfracodeVersion.createCopyById(infracode._id, envId, function(err, childInfracode) {
        if (err) { done(err); }
        expect(childInfracode).to.be.okay;
        expect(childInfracode.environment.toString()).to.equal(envId);
        expect(childInfracode.parentEnvironment).to.not.be.okay;
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString());
        done();
      })
    });
  });

  it('should be create a copy, but not have a parentEnv since the parent did not', function (done) {
    var envId = '507c7f79bcf86cd7994f6c11';
    var infracode = createNewInfracodeVersion();
    infracode.save(function (err, infracode) {
      InfracodeVersion.createCopyById(infracode._id, envId, function(err, childInfracode) {
        if (err) { done(err); }
        expect(childInfracode).to.be.okay;
        expect(childInfracode.environment.toString()).to.equal(envId);
        expect(childInfracode.parentEnvironment).to.not.be.okay;
        expect(childInfracode.parent.toString()).to.equal(infracode._id.toString());
        done();
      })
    });
  });
});
