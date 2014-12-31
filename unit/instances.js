var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var validation = require('./fixtures/validation');
var schemaValidators = require('../lib/models/mongo/schemas/schema-validators');
var Hashids = require('hashids');

var Instance = require('models/mongo/instance');
var dock = require('../test/fixtures/dock');
var Version = require('models/mongo/context-version');


var Docker = require('models/apis/docker');

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


  function createNewVersion() {
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
        repo: 'bkendall/flaming-octo-nemisis._',
        lowerRepo: 'bkendall/flaming-octo-nemisis._',
        branch: 'master',
        commit: 'deadbeef'
      }]
    });
  }

  function createNewInstance(name, dockerHost, containerId) {
    return new Instance({
      name: name || 'name',
      shortHash: getRandomHash(),
      public: false,
      owner: { github: validation.VALID_GITHUB_ID },
      createdBy: { github: validation.VALID_GITHUB_ID },
      build: validation.VALID_OBJECT_ID,
      created: Date.now(),
      contextVersion: createNewVersion(),
      container: {
        dockerContainer: containerId || validation.VALID_OBJECT_ID,
        dockerHost: dockerHost || 'http://localhost:4243',
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

  describe('modifySetContainer', function () {
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

    it('should work for inspect.state', function (done) {
      var newState = {
        'ExitCode': 0,
        'FinishedAt': '2014-11-25T22:39:50.23925175Z',
        'Paused': false,
        'Pid': 0,
        'Restarting': false,
        'Running': false,
        'StartedAt': '2014-11-25T22:29:50.23925175Z'
      };
      var containerData = {
        Image: 'f1c42afeb4a42b67a4d469c118c402be4b2be6749375b98288cbb29b5c1d154c',
        Path: 'nginx',
        State: newState,
        Id: '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1',
        Name: '/sad_engelbart4'
      };
      var currentDate = Date.now();
      savedInstance.modifySetContainer(containerData, 'http://localhost:4243', function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.inspect.State.Pid).to.equal(newState.Pid);
        expect(newInst.container.inspect.State.ExitCode).to.equal(newState.ExitCode);
        expect(newInst.container.inspect.State.Running).to.equal(newState.Running);
        expect(newInst.container.inspect.State.FinishedAt).to.equal(newState.FinishedAt);
        expect(newInst.container.inspect.Image).to.equal(containerData.Image);
        expect(newInst.container.inspect.Path).to.equal(containerData.Path);
        expect(newInst.container.inspect.Name).to.equal(containerData.Name);
        expect(newInst.container.inspect._updated).to.be.least(currentDate);
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
      var container = {
        dockerContainer: '985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452dd1'
      };
      savedInstance.inspectAndUpdate(container, 'http://localhost:4243', function (err) {
        expect(err.output.statusCode).to.equal(404);
        done();
      });
    });

    it('should work for real created container', function (done) {
      var docker = new Docker('http://localhost:4243');
      docker.createContainer({}, function (err, cont) {
        if (err) { return done(err); }
        var container = {
          dockerContainer: cont.id
        };
        docker.startContainer(container, function (err) {
          if (err) { return done(err); }
          docker.stopContainer(container, function (err) {
            if (err) { return done(err); }
            savedInstance.inspectAndUpdate(container, 'http://localhost:4243', function (err, saved) {
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
      var docker = new Docker('http://localhost:4243');
      docker.createContainer({}, function (err, cont) {
        if (err) { return done(err); }
        var container = {
          dockerContainer: cont.id
        };
        var instance = createNewInstance('new-inst', 'http://localhost:4243', cont.id);
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
      savedInstance.modifyContainerCreateErr(error, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.error.message).to.equal(error.message);
        expect(newInst.container.error.data).to.equal(error.data);
        expect(newInst.container.error.stack).to.equal(error.stack);
        expect(newInst.container.error.field).to.not.exist();
        done();
      });
    });

  });



  describe('modifySetContainerInspectErr', function () {
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
      savedInstance.modifySetContainerInspectErr(error, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.inspect.error.message).to.equal(error.message);
        expect(newInst.container.inspect.error.data).to.equal(error.data);
        expect(newInst.container.inspect.error.stack).to.equal(error.stack);
        expect(newInst.container.inspect.error.field).to.not.exist();
        done();
      });
    });

  });





  describe('setContainerFinishedState', function () {
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

    it('should work for inspect.state', function (done) {
      savedInstance.setContainerFinishedState('2014-11-25T22:40:50.23925175Z', -1, function (err, newInst) {
        if (err) { return done(err); }
        expect(newInst.container.inspect.State.Pid).to.equal(0);
        expect(newInst.container.inspect.State.ExitCode).to.equal(-1);
        expect(newInst.container.inspect.State.StartedAt).to.equal(instance.container.inspect.State.StartedAt);
        expect(newInst.container.inspect.State.Running).to.equal(false);
        expect(newInst.container.inspect.State.FinishedAt).to.equal('2014-11-25T22:40:50.23925175Z');
        expect(newInst.container.inspect.State.ExitCode).to.equal(-1);
        done();
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

    it('should not find and instance for the host that doesnot exist', function (done) {
      Instance.findAllByDockerHost('http://localhost:8888', function (err, instances) {
        if (err) { return done(err); }
        expect(instances.length).to.equal(0);
        done();
      });
    });

    it('should find one instance for the provided host', function (done) {
      Instance.findAllByDockerHost('http://localhost:4243', function (err, instances) {
        if (err) { return done(err); }
        expect(instances.length).to.equal(1);
        done();
      });
    });

    it('should find two instances out of three that match provided docker host', function (done) {
      createNewInstance('instance2', 'http://localhost:8888').save(function (err) {
        if (err) { return done(err); }
        createNewInstance('instance3', 'http://localhost:4243').save(function (err) {
          if (err) { return done(err); }
          Instance.findAllByDockerHost('http://localhost:4243', function (err, instances) {
            if (err) { return done(err); }
            expect(instances.length).to.equal(2);
            done();
          });
        });
      });
    });

  });

  describe('find by repo', function () {
    var savedInstance1 = null;
    var savedInstance2 = null;
    beforeEach(function (done) {
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
    beforeEach(function (done) {
      var instance = createNewInstance('instance2');
      instance.save(function (err, instance) {
        if (err) { return done(err); }
        else {
          expect(instance).to.be.okay;
          savedInstance2 = instance;
          done();
        }
      });
    });

    it('should find instances using repo name and branch', function (done) {
      Instance.findInstancesLinkedToBranch('bkendall/flaming-octo-nemisis._', 'master', function (err, insts) {
        if (err) { return done(err); }
        expect(insts.length).to.equal(2);
        expect([insts[0].name, insts[1].name]).to.deep.equal(['instance1', 'instance2']);
        done();
      });
    });

    it('should find context versions using repo name', function (done) {
      Instance.findContextVersionsForRepo('bkendall/flaming-octo-nemisis._', function (err, cvs) {
        if (err) { return done(err); }
        expect(cvs.length).to.equal(2);
        var actual = [String(cvs[1]), String(cvs[0])];
        expect(actual).to.deep.include(String(savedInstance1.contextVersion._id));
        expect(actual).to.deep.include(String(savedInstance2.contextVersion._id));
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
