'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var validation = require('./fixtures/validation')(lab);
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');
var Hashids = require('hashids');
var async = require('async');
var mongoose = require('mongoose');
var createCount = require('callback-count');
var error = require('error');

var Instance = require('models/mongo/instance');
var dock = require('../test/fixtures/dock');
var Version = require('models/mongo/context-version');

var Docker = require('models/apis/docker');

var id = 0;
function getNextId () {
  id++;
  return id;
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  return hashids.encrypt(getNextId())[0];
}
function newObjectId () {
  return new mongoose.Types.ObjectId();
}

describe('Instance', function () {
  before(require('./fixtures/mongo').connect);
  before(require('../test/fixtures/clean-mongo').removeEverything);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);


  function createNewVersion(opts) {
    return new Version({
      message: "test",
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
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
      },
      appCodeVersions: [{
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        commit: 'deadbeef'
      }]
    });
  }

  function createNewInstance(name, opts) {
    opts = opts || {};
    return new Instance({
      name: name || 'name',
      shortHash: getNextHash(),
      locked: opts.locked || false,
      public: false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      build: validation.VALID_OBJECT_ID,
      created: Date.now(),
      contextVersion: createNewVersion(opts),
      container: {
        dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
        dockerHost: opts.dockerHost || 'http://localhost:4242',
        inspect: {
          State: {
            'ExitCode': 0,
            'FinishedAt': '0001-01-01T00:00:00Z',
            'Paused': false,
            'Pid': 889,
            'Restarting': false,
            'Running': true,
            'StartedAt': '2014-11-25T22:29:50.23925175Z'
          },
        }
      },
      containers: [],
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

  describe('modifyContainer', function () {
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

    it('should update instance.container', function (done) {
      var cvId = savedInstance.contextVersion._id;
      var dockerContainer = '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1';
      var dockerHost = 'http://localhost:4242';
      savedInstance.modifyContainer(cvId, dockerContainer, dockerHost, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container).to.deep.equal({
          dockerContainer: dockerContainer,
          dockerHost: dockerHost
        });
        done();
      });
    });
    it('should conflict if the contextVersion has changed', function (done) {
      var cvId = newObjectId();
      var dockerContainer = '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1';
      var dockerHost = 'http://localhost:4242';
      savedInstance.modifyContainer(cvId, dockerContainer, dockerHost, function (err) {
        expect(err).to.be.ok;
        expect(err.output.statusCode).to.equal(409);
        done();
      });
    });
  });


  describe('inspectAndUpdate', function () {
    before(dock.start);
    after(dock.stop);

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

    it('should fail if container is not found', function (done) {
      savedInstance.inspectAndUpdate(function (err) {
        expect(err.output.statusCode).to.equal(404);
        done();
      });
    });

    it('should work for real created container', function (done) {
      var dockerHost = 'http://localhost:4242';
      var docker = new Docker(dockerHost);
      async.waterfall([
        docker.createContainer.bind(docker, {}),
        modifyContainer,
        startContainer,
        stopContainer,
        inspectAndUpdate
      ], done);

      function modifyContainer (container, cb) {
        var cvId = savedInstance.contextVersion._id;
        var dockerContainer = container.Id;
        var dockerHost = 'http://localhost:4242';
        savedInstance.modifyContainer(cvId, dockerContainer, dockerHost, cb);
      }
      function startContainer (savedInstance, cb) {
        docker.startContainer(savedInstance.container, function (err) {
          cb(err, savedInstance);
        });
      }
      function stopContainer (savedInstance, cb) {
        docker.stopContainer(savedInstance.container, function (err) {
          cb(err, savedInstance);
        });
      }
      function inspectAndUpdate (savedInstance, cb) {
        savedInstance.inspectAndUpdate(function (err, saved) {
          if (err) { return done(err); }
          expect(saved.container.inspect.State.Running).to.equal(false);
          expect(saved.container.inspect.State.Pid).to.equal(0);
          cb();
        });
      }
    });
  });


  describe('inspectAndUpdateByContainer', function () {
    before(dock.start);
    after(dock.stop);

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

    it('should fail if container is not found', function (done) {
      var containerId = '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1';
      Instance.inspectAndUpdateByContainer(containerId, function (err) {
        expect(err.output.statusCode).to.equal(404);
        done();
      });
    });

    it('should work for real created container', function (done) {
      var docker = new Docker('http://localhost:4242');
      docker.createContainer({}, function (err, cont) {
        if (err) { return done(err); }
        var container = {
          dockerContainer: cont.id
        };
        var opts = {
          dockerHost: 'http://localhost:4242',
          containerId: cont.id
        };
        var instance = createNewInstance('new-inst', opts);
        instance.save(function (err) {
          if (err) { return done(err); }
          docker.startContainer(container, function (err) {
            if (err) { return done(err); }
            docker.stopContainer(container, function (err) {
              if (err) { return done(err); }
              Instance.inspectAndUpdateByContainer(container.dockerContainer, function (err, saved) {
                if (err) { return done(err); }
                expect(saved.container.inspect.State.Running).to.equal(false);
                expect(saved.container.inspect.State.Pid).to.equal(0);
                done();
              });
            });
          });
        });
      });
    });

  });



  describe('modifyContainerCreateErr', function () {
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

    it('should pick message, stack and data fields', function (done) {
      var error = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field',
      };
      var cvId = savedInstance.contextVersion._id;
      savedInstance.modifyContainerCreateErr(cvId, error, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.error.message).to.equal(error.message);
        expect(newInst.container.error.data).to.equal(error.data);
        expect(newInst.container.error.stack).to.equal(error.stack);
        expect(newInst.container.error.field).to.not.exist();
        done();
      });
    });
    describe('conflict error', function () {
      var origErrorLog = error.log;
      after(function (done) {
        error.log = origErrorLog;
        done();
      });
      it('should conflict if the contextVersion has changed', function (done) {
        var fakeError = {
          message: 'random message',
          data: 'random data',
          stack: 'random stack',
          field: 'random field',
        };
        var count = createCount(3, done);
        error.log = function (err) {
          // first call
          if (err === fakeError) { return count.next(); }
          // second call
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.equal(409);
          count.next();
        };
        var cvId = newObjectId();
        savedInstance.modifyContainerCreateErr(cvId, fakeError, count.next);
      });
    });
  });



  describe('modifyContainerInspectErr', function () {
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

    it('should pick message, stack and data fields', function (done) {
      var fakeError = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field',
      };
      var dockerContainer = savedInstance.container.dockerContainer;
      savedInstance.modifyContainerInspectErr(dockerContainer, fakeError, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.inspect.error.message).to.equal(fakeError.message);
        expect(newInst.container.inspect.error.data).to.equal(fakeError.data);
        expect(newInst.container.inspect.error.stack).to.equal(fakeError.stack);
        expect(newInst.container.inspect.error.field).to.not.exist();
        done();
      });
    });
    describe('conflict error', function() {
      var origErrorLog = error.log;
      after(function (done) {
        error.log = origErrorLog;
        done();
      });
      it('should conflict if the container has changed', function (done) {
        var fakeError = {
          message: 'random message',
          data: 'random data',
          stack: 'random stack',
          field: 'random field',
        };
        var count = createCount(3, done);
        error.log = function (err) {
          // first call
          if (err === fakeError) { return count.next(); }
          // second call
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.equal(409);
          count.next();
        };
        var dockerContainer = 'fac985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452';
        savedInstance.modifyContainerInspectErr(dockerContainer, fakeError, count.next);
      });
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


  describe('find by repo and branch', function () {
    var savedInstance1 = null;
    var savedInstance2 = null;
    var savedInstance3 = null;
    before(function (done) {
      var instance = createNewInstance('instance1');
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance1 = instance;
          done();
        }
      });
    });
    before(function (done) {
      var instance = createNewInstance('instance2', {locked: false});
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance2 = instance;
          done();
        }
      });
    });
    before(function (done) {
      var instance = createNewInstance('instance3', {locked: true, repo: 'podviaznikov/hello'});
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance3 = instance;
          done();
        }
      });
    });

    it('should find instances using repo name and branch', function (done) {
      Instance.findInstancesLinkedToBranch('bkendall/flaming-octo-nemisis._', 'master', function (err, insts) {
        if (err) { return done(err); }
        expect(insts.length).to.equal(2);
        insts.forEach(function (inst) {
          expect(['instance1', 'instance2']).to.include(inst.name);
        });
        done();
      });
    });

    it('should not find instance using repo name and branch if it was locked', function (done) {
      Instance.findInstancesLinkedToBranch('podviaznikov/hello', 'master', function (err, insts) {
        if (err) { return done(err); }
        expect(insts.length).to.equal(0);
        done();
      });
    });

  });

  describe('#findContextVersionsForRepo', function () {
    var savedInstance = null;
    before(function (done) {
      var instance = createNewInstance('instance-name', {locked: true, repo: 'podviaznikov/hello'});
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance = instance;
          done();
        }
      });
    });
    it('should find context versions using repo name', function (done) {
      Instance.findContextVersionsForRepo('podviaznikov/hello', function (err, cvs) {
        if (err) { return done(err); }
        expect(cvs.length).to.equal(1);
        expect(String(cvs[0])).to.equal(String(savedInstance.contextVersion._id));
        done();
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
