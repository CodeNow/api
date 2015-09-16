/**
 * @module unit/workers/on-instance-container-start
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var Promise = require('bluebird');

var Code = require('code');
var keypather = require('keypather')();
var sinon = require('sinon');

var Build = require('models/mongo/build');
var BaseWorker = require('workers/base-worker');
var Hosts = require('models/redis/hosts');
var Mavis = require('models/apis/mavis');
var Sauron = require('models/apis/sauron');
var rabbitMQ = require('models/rabbitmq');

var DeployInstanceWorker = require('workers/deploy-instance-worker');

var AcceptableError = BaseWorker.acceptableError;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

function shouldntGoToThen(done) {
  return function () {
    done(new Error('Shouldn\'t have come through here'));
  };
}
describe('DeployInstanceWorker', function () {
  var ctx;

  var _dockerHost = '0.0.0.1';
  function makeExpectedCreateContainerJobDataForInstance(instance) {
    return {
      cvId: ctx.mockContextVersion._id,
      sessionUserId: ctx.worker.sessionUserGithubId,
      buildId: keypather.get(ctx.mockContextVersion, 'build._id.toString()'),
      dockerHost: _dockerHost,
      instanceEnvs: [
        instance.env[0],
        'RUNNABLE_CONTAINER_ID=' + instance.shortHash
      ],
      labels: {
        contextVersionId: ctx.mockContextVersion._id,
        instanceId: keypather.get(instance, '_id.toString()'),
        instanceName: keypather.get(instance, 'name.toString()'),
        instanceShortHash: keypather.get(instance, 'shortHash.toString()'),
        creatorGithubId: keypather.get(instance, 'createdBy.github.toString()'),
        ownerGithubId: keypather.get(instance, 'owner.github.toString()'),
        sessionUserGithubId: ctx.worker.sessionUserGithubId
      }
    };
  }
  beforeEach(function (done) {
    ctx = {};
    ctx.mockContextVersion = {
      '_id': '55d3ef733e1b620e00eb6292',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      },
      build: {
        _id: '23412312h3nk1lj2h3l1k2'
      }
    };
    ctx.mockBuild = {
      '_id': '23412312h3nk1lj2h3l1k2',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      },
      contextVersions: ['55d3ef733e1b620e00eb6292']
    };
    ctx.mockInstance = {
      '_id': '55d3ef733e1b620e00907292',
      name: 'name1',
      env: ['asdasdasd'],
      build: '23412312h3nk1lj2h3l1k2',
      shortHash: 'efrsdf',
      owner: {
        github: 21341234,
        username: 'foo',
        gravatar: 'cdsfgsdfg'
      },
      createdBy: {
        github: 21341234,
        username: 'foo',
        gravatar: 'cdsfgsdfg'
      },
      network: {
        hostIp: '0.0.0.0',
        networkIp: '1.1.1.1'
      },
      update: sinon.spy(function (query, opts, cb) {
        cb(null, ctx.mockInstance);
      })
    };
    ctx.mockInstance2 = {
      '_id': '55d3ef733e1b450e00907292',
      name: 'name2',
      env: ['asdasdasd'],
      shortHash: 'wertw4',
      owner: {
        github: 21341234,
        username: 'foo',
        gravatar: 'cdsfgsdfg'
      },
      createdBy: {
        github: 21341234,
        username: 'foo',
        gravatar: 'cdsfgsdfg'
      },
      locked: true,
      update: sinon.spy(function (query, opts, cb) {
        cb(null, ctx.mockInstance2);
      })
    };
    ctx.mockInstances = [ ctx.mockInstance, ctx.mockInstance2 ];
    ctx.labels = {
      instanceId: ctx.mockInstance._id,
      ownerUsername: 'fifo',
      sessionUserGithubId: 444,
      contextVersionId: 123
    };
    ctx.data = {
      instanceId: ctx.mockInstance._id
    };
    ctx.mockUser = {
      github: '',
      username: '',
      gravatar: ''
    };
    done();
  });
  beforeEach(function (done) {
    sinon.stub(BaseWorker.prototype, 'logError');
    done();
  });
  afterEach(function (done) {
    BaseWorker.prototype.logError.restore();
    done();
  });
  describe('all together', function () {
    beforeEach(function (done) {
      sinon.stub(BaseWorker.prototype, 'pFindBuild').returns(Promise.resolve(ctx.mockBuild));

      sinon.stub(BaseWorker.prototype, 'pFindContextVersion')
        .returns(Promise.resolve(ctx.mockContextVersion));
      sinon.stub(BaseWorker.prototype, 'pUpdateInstanceFrontend').returns(Promise.resolve());
      sinon.stub(BaseWorker.prototype, 'pFindUser').returns(Promise.resolve(ctx.mockUser));
      sinon.stub(Mavis.prototype, 'findDockForContainer').yieldsAsync(null, _dockerHost);
      sinon.stub(rabbitMQ, 'createInstanceContainer');
      done();
    });
    afterEach(function (done) {
      Mavis.prototype.findDockForContainer.restore();
      rabbitMQ.createInstanceContainer.restore();
      BaseWorker.prototype.pFindInstances.restore();
      BaseWorker.prototype.pFindContextVersion.restore();
      BaseWorker.prototype.pFindBuild.restore();
      BaseWorker.prototype.pUpdateInstanceFrontend.restore();
      BaseWorker.prototype.pFindUser.restore();
      done();
    });
    describe('success', function () {
      it('should do everything with an instanceId', function (done) {
        sinon.stub(BaseWorker.prototype, 'pFindInstances')
          .returns(Promise.resolve([ctx.mockInstance]));
        ctx.worker = new DeployInstanceWorker({
          instanceId: ctx.mockInstance._id
        });
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined();
          expect(BaseWorker.prototype.pFindInstances.callCount).to.equal(1);
          expect(BaseWorker.prototype.pFindInstances.args[0][0]).to.deep.equal({
            _id: ctx.mockInstance._id
          });
          expect(BaseWorker.prototype.pFindBuild.callCount).to.equal(1);
          expect(BaseWorker.prototype.pFindBuild.args[0][0]).to.deep.equal({
            _id: ctx.mockBuild._id
          });
          expect(BaseWorker.prototype.pFindContextVersion.callCount).to.equal(1);
          expect(BaseWorker.prototype.pFindContextVersion.args[0][0]).to.deep.equal({
            _id: ctx.mockContextVersion._id
          });
          expect(ctx.mockInstance.update.callCount).to.equal(1);
          expect(ctx.mockInstance.update.args[0][0]).to.deep.equal({
            '$set': {
              'contextVersion': ctx.mockContextVersion
          }});
          expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1);
          expect(Mavis.prototype.findDockForContainer.args[0][0])
            .to.deep.equal(ctx.mockContextVersion);

          expect(rabbitMQ.createInstanceContainer.callCount).to.equal(1);
          expect(rabbitMQ.createInstanceContainer.args[0][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance));
          done();
        });
      });
      it('should do everything with an buildId', function (done) {
        sinon.stub(BaseWorker.prototype, 'pFindInstances')
          .returns(Promise.resolve(ctx.mockInstances));
        ctx.worker = new DeployInstanceWorker({
          instanceId: ctx.mockInstance._id
        });
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined();
          expect(BaseWorker.prototype.pFindInstances.callCount).to.equal(1);
          expect(BaseWorker.prototype.pFindInstances.args[0][0]).to.deep.equal({
            _id: ctx.mockInstance._id
          });
          expect(BaseWorker.prototype.pFindBuild.callCount).to.equal(1);
          expect(BaseWorker.prototype.pFindBuild.args[0][0]).to.deep.equal({
            _id: ctx.mockBuild._id
          });
          expect(BaseWorker.prototype.pFindContextVersion.callCount).to.equal(1);
          expect(BaseWorker.prototype.pFindContextVersion.args[0][0]).to.deep.equal({
            _id: ctx.mockContextVersion._id
          });
          expect(ctx.mockInstance.update.callCount).to.equal(1);
          expect(ctx.mockInstance.update.args[0][0]).to.deep.equal({
            '$set': {
              'contextVersion': ctx.mockContextVersion
          }});
          expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1);
          expect(Mavis.prototype.findDockForContainer.args[0][0])
            .to.deep.equal(ctx.mockContextVersion);

          expect(rabbitMQ.createInstanceContainer.callCount).to.equal(2);
          expect(rabbitMQ.createInstanceContainer.args[0][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance));
          done();
        });
      });
    });
  });


  describe('individual methods', function () {
    beforeEach(function (done) {
      ctx.worker = new DeployInstanceWorker(ctx.data);
      done();
    });
    describe('findInstances', function () {
      var query = {
        _id: 'hello'
      };
      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(BaseWorker.prototype, 'pFindInstances')
            .returns(Promise.resolve(ctx.mockInstances));
          done();
        });

        afterEach(function (done) {
          BaseWorker.prototype.pFindInstances.restore();
          done();
        });

        it('should return with the list of instances', function (done) {
          ctx.worker._findInstances(query)
            .then(function (instance) {
              expect(instance).to.equal(ctx.mockInstances);
              expect(BaseWorker.prototype.pFindInstances.callCount).to.equal(1);
              expect(BaseWorker.prototype.pFindInstances.args[0][0]).to.equal(query);
              done();
            })
            .catch(done);
        });
      });
      describe('failure', function () {
        afterEach(function (done) {
          BaseWorker.prototype.pFindInstances.restore();
          done();
        });
        it('should return an acceptable error when given an empty array', function (done) {
          sinon.stub(BaseWorker.prototype, 'pFindInstances').returns(Promise.resolve([]));
          ctx.worker._findInstances(query)
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, function (err) {
              expect(BaseWorker.prototype.pFindInstances.callCount).to.equal(1);
              expect(BaseWorker.prototype.pFindInstances.args[0][0]).to.equal(query);
              expect(err.message).to.equal('No instances were found');
              done();
            })
            .catch(done);
        });

        it('should throw normal error when pFindInstances returns an error', function (done) {
          var error = new Error('database error');
          sinon.stub(BaseWorker.prototype, 'pFindInstances')
            .returns(new Promise(function (resolve, reject) {
              reject(error);
            }));
          ctx.worker._findInstances(query)
            .then()
            .catch(AcceptableError, done)
            .catch(function (err) {
              expect(BaseWorker.prototype.pFindInstances.callCount).to.equal(1);
              expect(BaseWorker.prototype.pFindInstances.args[0][0]).to.equal(query);
              expect(err).to.equal(error);
              done();
            });
        });
      });
    });
    describe('_filterAndSaveCvToInstances', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_updateInstance', function (instance) {
          return Promise.resolve(instance);
        });
        done();
      });

      afterEach(function (done) {
        ctx.worker._updateInstance.restore();
        done();
      });
      describe('success', function () {
        it('should not filter out instances when manual', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', true);
          ctx.worker._filterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._updateInstance.callCount).to.equal(ctx.mockInstances.length);
              expect(instances).to.deep.equal(ctx.mockInstances);
              expect(ctx.worker._updateInstance.args[0][0]).to.equal(ctx.mockInstance);
              expect(ctx.worker._updateInstance.args[1][0]).to.equal(ctx.mockInstance2);
              expect(ctx.worker._updateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              });
              expect(ctx.worker._updateInstance.args[1][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              });
              done();
            })
            .catch(done);
        });
        it('should filter out locked instances when not manual', function (done) {
          ctx.mockInstances.push(ctx.mockInstance2);
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false);
          ctx.worker._filterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._updateInstance.callCount).to.equal(1);
              expect(instances).to.deep.equal([ctx.mockInstance]);
              expect(ctx.worker._updateInstance.args[0][0]).to.equal(ctx.mockInstance);
              expect(ctx.worker._updateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              });
              done();
            })
            .catch(done);
        });
      });
      describe('errors', function () {
        it('should return acceptable error when all instances are filtered out', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false);
          ctx.worker._filterAndSaveCvToInstances([ctx.mockInstance2], ctx.mockContextVersion)
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, function (err) {
              expect(err.message).to.equal('No instances were found to deploy');
              done();
            })
            .catch(done);
        });
        it('should fall into the catch when one of the instance updates fail', function (done) {
          var error = new Error('generic error');
          ctx.worker._updateInstance.restore();
          sinon.stub(ctx.worker, '_updateInstance').returns(new Promise(function (resolve, reject) {
            reject(error);
          }));
          ctx.worker._filterAndSaveCvToInstances(
            [ctx.mockInstance, ctx.mockInstance],
            ctx.mockContextVersion
          )
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, done)
            .catch(function (err) {
              expect(err).to.equal(error);
              done();
            });
        });
      });
    });
    describe('_filterAndSaveCvToInstances', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_updateInstance', function (instance) {
          return Promise.resolve(instance);
        });
        done();
      });

      afterEach(function (done) {
        ctx.worker._updateInstance.restore();
        done();
      });
      describe('success', function () {
        it('should not filter out instances when manual', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', true);
          ctx.worker._filterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._updateInstance.callCount).to.equal(ctx.mockInstances.length);
              expect(instances).to.deep.equal(ctx.mockInstances);
              expect(ctx.worker._updateInstance.args[0][0]).to.equal(ctx.mockInstance);
              expect(ctx.worker._updateInstance.args[1][0]).to.equal(ctx.mockInstance2);
              expect(ctx.worker._updateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              });
              expect(ctx.worker._updateInstance.args[1][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              });
              done();
            })
            .catch(done);
        });
        it('should filter out locked instances when not manual', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false);
          ctx.worker._filterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._updateInstance.callCount).to.equal(1);
              expect(instances).to.deep.equal([ctx.mockInstance]);
              expect(ctx.worker._updateInstance.args[0][0]).to.equal(ctx.mockInstance);
              expect(ctx.worker._updateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              });
              done();
            })
            .catch(done);
        });
      });
      describe('errors', function () {
        it('should return acceptable error when all instances are filtered out', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false);
          ctx.worker._filterAndSaveCvToInstances([ctx.mockInstance2], ctx.mockContextVersion)
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, function (err) {
              expect(err.message).to.equal('No instances were found to deploy');
              done();
            })
            .catch(done);
        });
        it('should fall into the catch when one of the instance updates fail', function (done) {
          var error = new Error('generic error');
          ctx.worker._updateInstance.restore();
          sinon.stub(ctx.worker, '_updateInstance').returns(new Promise(function (resolve, reject) {
            reject(error);
          }));
          ctx.worker._filterAndSaveCvToInstances(
            [ctx.mockInstance, ctx.mockInstance],
            ctx.mockContextVersion
          )
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, done)
            .catch(function (err) {
              expect(err).to.equal(error);
              done();
            });
        });
      });
    });
    describe('_enqueueCreateContainerWorkers', function () {
      beforeEach(function (done) {
        ctx.worker.sessionUserGithubId = 12;
        sinon.stub(rabbitMQ, 'createInstanceContainer');
        done();
      });

      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore();
        done();
      });
      describe('success', function () {
        it('should create a CreateContainer worker for each instance it\'s given', function (done) {
          var dockerHost = '0.0.0.1';



          ctx.worker._enqueueCreateContainerWorkers(
            ctx.mockInstances,
            ctx.mockContextVersion,
            dockerHost
          );
          expect(rabbitMQ.createInstanceContainer.callCount).to.equal(2);
          expect(rabbitMQ.createInstanceContainer.args[0][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance));
          expect(rabbitMQ.createInstanceContainer.args[1][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance2));
          done();
        });
      });
    });
    describe('_emitEvents', function () {
      beforeEach(function (done) {
        ctx.worker.sessionUserGithubId = 12;
        sinon.stub(ctx.worker, 'pUpdateInstanceFrontend').returns(Promise.resolve());
        sinon.stub(ctx.worker, 'pFindUser').returns(Promise.resolve(ctx.mockUser));
        done();
      });

      afterEach(function (done) {
        ctx.worker.pUpdateInstanceFrontend.restore();
        ctx.worker.pFindUser.restore();
        done();
      });
      describe('success', function () {
        it('should create a CreateContainer worker for each instance it\'s given', function (done) {
          ctx.worker._emitEvents(ctx.mockInstances)
            .then(function () {
              expect(ctx.worker.pFindUser.callCount).to.equal(1);
              expect(ctx.worker.pFindUser.args[0][0]).to.equal(12);
              expect(ctx.worker.pUpdateInstanceFrontend.callCount).to.equal(2);
              expect(ctx.worker.pUpdateInstanceFrontend.args[0][0])
                .to.deep.equal({'_id': ctx.mockInstance._id});
              expect(ctx.worker.pUpdateInstanceFrontend.args[1][0])
                .to.deep.equal({'_id': ctx.mockInstance2._id});
              expect(ctx.worker.pUpdateInstanceFrontend.args[0][1])
                .to.equal('deploy');
              expect(ctx.worker.pUpdateInstanceFrontend.args[1][1])
                .to.equal('deploy');
              done();
            })
            .catch(done);
        });
      });
    });
    describe('_getDockHost', function () {

      beforeEach(function (done) {
        ctx.worker.sessionUserGithubId = 12;
        sinon.stub(Mavis.prototype, 'findDockForContainer').yieldsAsync(null, _dockerHost);
        done();
      });

      afterEach(function (done) {
        Mavis.prototype.findDockForContainer.restore();
        done();
      });
      describe('success', function () {
        it('should get the dockHost from the cv', function (done) {
          ctx.worker._getDockHost(ctx.mockContextVersion)
            .then(function (dockerHost) {
              expect(dockerHost, 'dockerHost').to.equal(_dockerHost);
              expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1);
              expect(Mavis.prototype.findDockForContainer.args[0][0])
                .to.equal(ctx.mockContextVersion);
              done();
            })
            .catch(done);
        });
        it('should get the dockHost from the forceDock setting', function (done) {
          ctx.worker.forceDock = '127.0.0.1';
          ctx.worker._getDockHost(ctx.mockContextVersion)
            .then(function (dockerHost) {
              expect(dockerHost, 'dockerHost').to.equal(ctx.worker.forceDock);
              expect(Mavis.prototype.findDockForContainer.callCount).to.equal(0);
              done();
            })
            .catch(done);
        });
      });
    });
  });
});
