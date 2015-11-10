/**
 * @module unit/workers/on-instance-container-start
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var Promise = require('bluebird')

var Code = require('code')
var keypather = require('keypather')()
var sinon = require('sinon')

var BaseWorker = require('workers/base-worker')
var Instance = require('models/mongo/instance')
var Mavis = require('models/apis/mavis')
var rabbitMQ = require('models/rabbitmq')
var User = require('models/mongo/user')
var messenger = require('socket/messenger')

var DeployInstanceWorker = require('workers/deploy-instance')

var AcceptableError = BaseWorker.acceptableError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

function shouldntGoToThen (done) {
  return function () {
    done(new Error("Shouldn't have come through here"))
  }
}
describe('DeployInstanceWorker', function () {
  var ctx

  var _dockerHost = '0.0.0.1'
  function makeExpectedCreateContainerJobDataForInstance (instance) {
    return {
      cvId: ctx.mockContextVersion._id,
      sessionUserId: ctx.worker.sessionUserGithubId,
      dockerHost: _dockerHost,
      instanceId: instance._id.toString(),
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
        ownerUsername: ctx.worker.ownerUsername,
        ownerGithubId: keypather.get(instance, 'owner.github.toString()'),
        sessionUserGithubId: ctx.worker.sessionUserGithubId.toString()
      }
    }
  }
  beforeEach(function (done) {
    ctx = {}
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
      },
      toJSON: function () {
        return ctx.mockContextVersion
      }
    }
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
    }
    ctx.mockInstance = {
      '_id': ctx.mockBuild._id,
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
        hostIp: '0.0.0.0'
      },
      update: sinon.spy(function (query, opts, cb) {
        cb(null, ctx.mockInstance)
      }),
      populateModels: function () {},
      populateOwnerAndCreatedBy: function () {}
    }
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
        cb(null, ctx.mockInstance2)
      })
    }
    ctx.mockInstances = [ ctx.mockInstance, ctx.mockInstance2 ]
    ctx.labels = {
      instanceId: ctx.mockInstance._id,
      ownerUsername: 'fifo',
      sessionUserGithubId: 444,
      contextVersionId: 123
    }
    ctx.data = {
      instanceId: ctx.mockInstance._id
    }
    ctx.mockUser = {
      github: '',
      username: '',
      gravatar: '',
      toJSON: function () {}
    }
    done()
  })
  beforeEach(function (done) {
    sinon.stub(BaseWorker.prototype, 'logError')
    done()
  })
  afterEach(function (done) {
    BaseWorker.prototype.logError.restore()
    done()
  })
  describe('all together', function () {
    beforeEach(function (done) {
      sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindBuild')
        .returns(Promise.resolve(ctx.mockBuild))

      sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindContextVersion')
        .returns(Promise.resolve(ctx.mockContextVersion))
      sinon.stub(User, 'findByGithubId').yieldsAsync(null, ctx.mockUser)
      sinon.stub(Mavis.prototype, 'findDockForContainer').yieldsAsync(null, _dockerHost)
      sinon.stub(rabbitMQ, 'createInstanceContainer')

      sinon.stub(Instance, 'findOne').yieldsAsync(null, ctx.mockInstance)
      sinon.stub(ctx.mockInstance, 'populateModels').yieldsAsync(null)
      sinon.stub(ctx.mockInstance, 'populateOwnerAndCreatedBy')
        .yieldsAsync(null, ctx.mockInstance)
      sinon.stub(messenger, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      Mavis.prototype.findDockForContainer.restore()
      rabbitMQ.createInstanceContainer.restore()
      BaseWorker.prototype._pBaseWorkerFindInstances.restore()
      BaseWorker.prototype._pBaseWorkerFindContextVersion.restore()
      BaseWorker.prototype._pBaseWorkerFindBuild.restore()
      User.findByGithubId.restore()
      Instance.findOne.restore()
      ctx.mockInstance.populateModels.restore()
      ctx.mockInstance.populateOwnerAndCreatedBy.restore()
      messenger.emitInstanceUpdate.restore()
      done()
    })
    describe('success', function () {
      it('should do everything with an instanceId', function (done) {
        sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindInstances')
          .returns(Promise.resolve([ctx.mockInstance]))
        ctx.worker = new DeployInstanceWorker({
          instanceId: ctx.mockInstance._id,
          sessionUserGithubId: 12,
          ownerUsername: 'asdfasdf'
        })
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined()
          expect(BaseWorker.prototype._pBaseWorkerFindInstances.callCount).to.equal(1)
          expect(BaseWorker.prototype._pBaseWorkerFindInstances.args[0][0]).to.deep.equal({
            _id: ctx.mockInstance._id
          })
          expect(BaseWorker.prototype._pBaseWorkerFindBuild.callCount).to.equal(1)
          expect(BaseWorker.prototype._pBaseWorkerFindBuild.args[0][0]).to.deep.equal({
            _id: ctx.mockBuild._id,
            completed: { $exists: true },
            'failed': false
          })
          expect(BaseWorker.prototype._pBaseWorkerFindContextVersion.callCount).to.equal(1)
          expect(BaseWorker.prototype._pBaseWorkerFindContextVersion.args[0][0]).to.deep.equal({
            _id: ctx.mockContextVersion._id
          })
          expect(ctx.mockInstance.update.callCount).to.equal(1)
          expect(ctx.mockInstance.update.args[0][0]).to.deep.equal({
            '$set': {
              'contextVersion': ctx.mockContextVersion
            }
          })
          expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1)
          expect(Mavis.prototype.findDockForContainer.args[0][0])
            .to.deep.equal(ctx.mockContextVersion)

          expect(rabbitMQ.createInstanceContainer.callCount).to.equal(1)
          expect(rabbitMQ.createInstanceContainer.args[0][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance))

          expect(User.findByGithubId.callCount).to.equal(1)
          expect(User.findByGithubId.args[0][0]).to.deep.equal(12)

          expect(Instance.findOne.callCount).to.equal(1)
          expect(Instance.findOne.args[0][0]).to.deep.equal({ '_id': ctx.mockInstance._id })
          expect(ctx.mockInstance.populateModels.callCount).to.equal(1)
          expect(ctx.mockInstance.populateOwnerAndCreatedBy.callCount).to.equal(1)
          expect(ctx.mockInstance.populateOwnerAndCreatedBy.args[0][0])
            .to.deep.equal(ctx.mockUser)
          expect(
            messenger.emitInstanceUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1)
          expect(
            messenger.emitInstanceUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockInstance)
          expect(
            messenger.emitInstanceUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('deploy')

          done()
        })
          .catch(done)
      })
      it('should do everything with an buildId', function (done) {
        sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindInstances')
          .returns(Promise.resolve(ctx.mockInstances))
        ctx.worker = new DeployInstanceWorker({
          buildId: ctx.mockBuild._id,
          sessionUserGithubId: 12,
          ownerUsername: 'asdfasdf'
        })
        ctx.worker.handle(function (err) {
          expect(err).to.be.undefined()
          expect(BaseWorker.prototype._pBaseWorkerFindInstances.callCount).to.equal(1)
          expect(BaseWorker.prototype._pBaseWorkerFindInstances.args[0][0]).to.deep.equal({
            'build': ctx.mockBuild._id
          })
          expect(BaseWorker.prototype._pBaseWorkerFindBuild.callCount).to.equal(1)
          expect(BaseWorker.prototype._pBaseWorkerFindBuild.args[0][0]).to.deep.equal({
            _id: ctx.mockBuild._id,
            completed: { $exists: true },
            'failed': false
          })
          expect(BaseWorker.prototype._pBaseWorkerFindContextVersion.callCount).to.equal(1)
          expect(BaseWorker.prototype._pBaseWorkerFindContextVersion.args[0][0]).to.deep.equal({
            _id: ctx.mockContextVersion._id
          })
          expect(ctx.mockInstance.update.callCount).to.equal(1)
          expect(ctx.mockInstance.update.args[0][0]).to.deep.equal({
            '$set': {
              'contextVersion': ctx.mockContextVersion
            }
          })
          expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1)
          expect(Mavis.prototype.findDockForContainer.args[0][0])
            .to.deep.equal(ctx.mockContextVersion)

          // Should filter mockInstance2 out since it's locked
          expect(rabbitMQ.createInstanceContainer.callCount).to.equal(1)
          expect(rabbitMQ.createInstanceContainer.args[0][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance))
          done()
        })
          .catch(done)
        it('should do everything with a buildId and manual', function (done) {
          sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindInstances')
            .returns(Promise.resolve(ctx.mockInstances))
          ctx.worker = new DeployInstanceWorker({
            buildId: ctx.mockBuild._id,
            sessionUserGithubId: 12,
            ownerUsername: 'asdfasdf'
          })
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', true)
          ctx.worker.handle(function (err) {
            expect(err).to.be.undefined()
            expect(BaseWorker.prototype._pBaseWorkerFindInstances.callCount).to.equal(1)
            expect(BaseWorker.prototype._pBaseWorkerFindInstances.args[0][0]).to.deep.equal({
              'build': ctx.mockBuild._id
            })
            expect(BaseWorker.prototype._pBaseWorkerFindBuild.callCount).to.equal(1)
            expect(BaseWorker.prototype._pBaseWorkerFindBuild.args[0][0]).to.deep.equal({
              _id: ctx.mockBuild._id,
              'failed': false
            })
            expect(BaseWorker.prototype._pBaseWorkerFindContextVersion.callCount).to.equal(1)
            expect(BaseWorker.prototype._pBaseWorkerFindContextVersion.args[0][0]).to.deep.equal({
              _id: ctx.mockContextVersion._id
            })
            expect(ctx.mockInstance.update.callCount).to.equal(1)
            expect(ctx.mockInstance.update.args[0][0]).to.deep.equal({
              '$set': {
                'contextVersion': ctx.mockContextVersion
              }
            })
            expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1)
            expect(Mavis.prototype.findDockForContainer.args[0][0])
              .to.deep.equal(ctx.mockContextVersion)

            // Should filter mockInstance2 out since it's locked
            expect(rabbitMQ.createInstanceContainer.callCount).to.equal(2)
            expect(rabbitMQ.createInstanceContainer.args[0][0])
              .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance))
            expect(rabbitMQ.createInstanceContainer.args[1][0])
              .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance2))
            done()
          })
            .catch(done)
        })
      })
    })
  })

  describe('individual methods', function () {
    beforeEach(function (done) {
      ctx.worker = new DeployInstanceWorker(ctx.data)
      done()
    })
    describe('findInstances', function () {
      var query = {
        _id: 'hello'
      }
      describe('success', function () {
        beforeEach(function (done) {
          sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindInstances')
            .returns(Promise.resolve(ctx.mockInstances))
          done()
        })

        afterEach(function (done) {
          BaseWorker.prototype._pBaseWorkerFindInstances.restore()
          done()
        })

        it('should return with the list of instances', function (done) {
          ctx.worker._pFindInstances(query)
            .then(function (instance) {
              expect(instance).to.equal(ctx.mockInstances)
              expect(BaseWorker.prototype._pBaseWorkerFindInstances.callCount).to.equal(1)
              expect(BaseWorker.prototype._pBaseWorkerFindInstances.args[0][0]).to.equal(query)
              done()
            })
            .catch(done)
        })
      })
      describe('failure', function () {
        afterEach(function (done) {
          BaseWorker.prototype._pBaseWorkerFindInstances.restore()
          done()
        })
        it('should return an acceptable error when given an empty array', function (done) {
          sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindInstances').returns(Promise.resolve([]))
          ctx.worker._pFindInstances(query)
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, function (err) {
              expect(BaseWorker.prototype._pBaseWorkerFindInstances.callCount).to.equal(1)
              expect(BaseWorker.prototype._pBaseWorkerFindInstances.args[0][0]).to.equal(query)
              expect(err.message).to.equal('No instances were found')
              done()
            })
            .catch(done)
        })

        it('should throw normal error when _pBaseWorkerFindInstances returns an error', function (done) {
          var error = new Error('database error')
          sinon.stub(BaseWorker.prototype, '_pBaseWorkerFindInstances')
            .returns(new Promise(function (resolve, reject) {
              reject(error)
            }))
          ctx.worker._pFindInstances(query)
            .then()
            .catch(AcceptableError, done)
            .catch(function (err) {
              expect(BaseWorker.prototype._pBaseWorkerFindInstances.callCount).to.equal(1)
              expect(BaseWorker.prototype._pBaseWorkerFindInstances.args[0][0]).to.equal(query)
              expect(err).to.equal(error)
              done()
            })
            .catch(done)
        })
      })
    })
    describe('_pFilterAndSaveCvToInstances', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_pUpdateInstance', function (instance) {
          return Promise.resolve(instance)
        })
        done()
      })

      afterEach(function (done) {
        ctx.worker._pUpdateInstance.restore()
        done()
      })
      describe('success', function () {
        it('should not filter out instances when manual', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', true)
          ctx.worker._pFilterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._pUpdateInstance.callCount).to.equal(ctx.mockInstances.length)
              expect(instances).to.deep.equal(ctx.mockInstances)
              expect(ctx.worker._pUpdateInstance.args[0][0]).to.equal(ctx.mockInstance)
              expect(ctx.worker._pUpdateInstance.args[1][0]).to.equal(ctx.mockInstance2)
              expect(ctx.worker._pUpdateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              })
              expect(ctx.worker._pUpdateInstance.args[1][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              })
              done()
            })
            .catch(done)
        })
        it('should filter out locked instances when not manual', function (done) {
          ctx.mockInstances.push(ctx.mockInstance2)
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false)
          ctx.worker._pFilterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._pUpdateInstance.callCount).to.equal(1)
              expect(instances).to.deep.equal([ctx.mockInstance])
              expect(ctx.worker._pUpdateInstance.args[0][0]).to.equal(ctx.mockInstance)
              expect(ctx.worker._pUpdateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              })
              done()
            })
            .catch(done)
        })
      })
      describe('errors', function () {
        it('should return acceptable error when all instances are filtered out', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false)
          ctx.worker._pFilterAndSaveCvToInstances([ctx.mockInstance2], ctx.mockContextVersion)
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, function (err) {
              expect(err.message).to.equal('No instances were found to deploy')
              done()
            })
            .catch(done)
        })
        it('should fall into the catch when one of the instance updates fail', function (done) {
          var error = new Error('generic error')
          ctx.worker._pUpdateInstance.restore()
          sinon.stub(ctx.worker, '_pUpdateInstance').returns(new Promise(function (resolve, reject) {
            reject(error)
          }))
          ctx.worker._pFilterAndSaveCvToInstances(
            [ctx.mockInstance, ctx.mockInstance],
            ctx.mockContextVersion
          )
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, done)
            .catch(function (err) {
              expect(err).to.equal(error)
              done()
            })
            .catch(done)
        })
      })
    })
    describe('_pFilterAndSaveCvToInstances', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_pUpdateInstance', function (instance) {
          return Promise.resolve(instance)
        })
        done()
      })

      afterEach(function (done) {
        ctx.worker._pUpdateInstance.restore()
        done()
      })
      describe('success', function () {
        it('should not filter out instances when manual', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', true)
          ctx.worker._pFilterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._pUpdateInstance.callCount).to.equal(ctx.mockInstances.length)
              expect(instances).to.deep.equal(ctx.mockInstances)
              expect(ctx.worker._pUpdateInstance.args[0][0]).to.equal(ctx.mockInstance)
              expect(ctx.worker._pUpdateInstance.args[1][0]).to.equal(ctx.mockInstance2)
              expect(ctx.worker._pUpdateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              })
              expect(ctx.worker._pUpdateInstance.args[1][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              })
              done()
            })
            .catch(done)
        })
        it('should filter out locked instances when not manual', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false)
          ctx.worker._pFilterAndSaveCvToInstances(ctx.mockInstances, ctx.mockContextVersion)
            .then(function (instances) {
              expect(ctx.worker._pUpdateInstance.callCount).to.equal(1)
              expect(instances).to.deep.equal([ctx.mockInstance])
              expect(ctx.worker._pUpdateInstance.args[0][0]).to.equal(ctx.mockInstance)
              expect(ctx.worker._pUpdateInstance.args[0][1]).to.deep.equal({
                'contextVersion': ctx.mockContextVersion
              })
              done()
            })
            .catch(done)
        })
      })
      describe('errors', function () {
        it('should return acceptable error when all instances are filtered out', function (done) {
          keypather.set(ctx.mockContextVersion, 'build.triggeredAction.manual', false)
          ctx.worker._pFilterAndSaveCvToInstances([ctx.mockInstance2], ctx.mockContextVersion)
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, function (err) {
              expect(err.message).to.equal('No instances were found to deploy')
              done()
            })
            .catch(done)
        })
        it('should fall into the catch when one of the instance updates fail', function (done) {
          var error = new Error('generic error')
          ctx.worker._pUpdateInstance.restore()
          sinon.stub(ctx.worker, '_pUpdateInstance').returns(new Promise(function (resolve, reject) {
            reject(error)
          }))
          ctx.worker._pFilterAndSaveCvToInstances(
            [ctx.mockInstance, ctx.mockInstance],
            ctx.mockContextVersion
          )
            .then(shouldntGoToThen(done))
            .catch(AcceptableError, done)
            .catch(function (err) {
              expect(err).to.equal(error)
              done()
            })
            .catch(done)
        })
      })
    })
    describe('_enqueueCreateContainerWorkers', function () {
      beforeEach(function (done) {
        ctx.worker.sessionUserGithubId = 12
        sinon.stub(rabbitMQ, 'createInstanceContainer')
        done()
      })

      afterEach(function (done) {
        rabbitMQ.createInstanceContainer.restore()
        done()
      })
      describe('success', function () {
        it("should create a CreateContainer worker for each instance it's given", function (done) {
          var dockerHost = '0.0.0.1'
          ctx.worker._enqueueCreateContainerWorkers(
            ctx.mockInstances,
            ctx.mockContextVersion,
            dockerHost
          )
          expect(rabbitMQ.createInstanceContainer.callCount).to.equal(2)
          expect(rabbitMQ.createInstanceContainer.args[0][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance))
          expect(rabbitMQ.createInstanceContainer.args[1][0])
            .to.deep.equal(makeExpectedCreateContainerJobDataForInstance(ctx.mockInstance2))
          done()
        })
      })
    })
    describe('_pEmitEvents', function () {
      beforeEach(function (done) {
        ctx.worker.sessionUserGithubId = 12
        sinon.stub(ctx.worker, '_pBaseWorkerUpdateInstanceFrontend').returns(Promise.resolve())
        done()
      })

      afterEach(function (done) {
        ctx.worker._pBaseWorkerUpdateInstanceFrontend.restore()
        done()
      })
      describe('success', function () {
        it("should create a CreateContainer worker for each instance it's given", function (done) {
          ctx.worker._pEmitEvents(ctx.mockInstances)
            .then(function () {
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.callCount).to.equal(2)
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.args[0][0])
                .to.deep.equal(ctx.mockInstance._id)
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.args[1][0])
                .to.deep.equal(ctx.mockInstance2._id)
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.args[0][1])
                .to.deep.equal(12)
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.args[1][1])
                .to.deep.equal(12)
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.args[0][2])
                .to.equal('deploy')
              expect(ctx.worker._pBaseWorkerUpdateInstanceFrontend.args[1][2])
                .to.equal('deploy')
              done()
            })
            .catch(done)
        })
      })
    })
    describe('_pGetDockHost', function () {
      beforeEach(function (done) {
        ctx.worker.sessionUserGithubId = 12
        sinon.stub(Mavis.prototype, 'findDockForContainer').yieldsAsync(null, _dockerHost)
        done()
      })

      afterEach(function (done) {
        Mavis.prototype.findDockForContainer.restore()
        done()
      })
      describe('success', function () {
        it('should get the dockHost from the cv', function (done) {
          ctx.worker._pGetDockHost(ctx.mockContextVersion)
            .then(function (dockerHost) {
              expect(dockerHost, 'dockerHost').to.equal(_dockerHost)
              expect(Mavis.prototype.findDockForContainer.callCount).to.equal(1)
              expect(Mavis.prototype.findDockForContainer.args[0][0])
                .to.equal(ctx.mockContextVersion)
              done()
            })
            .catch(done)
        })
        it('should get the dockHost from the forceDock setting', function (done) {
          ctx.worker.forceDock = '127.0.0.1'
          ctx.worker._pGetDockHost(ctx.mockContextVersion)
            .then(function (dockerHost) {
              expect(dockerHost, 'dockerHost').to.equal(ctx.worker.forceDock)
              expect(Mavis.prototype.findDockForContainer.callCount).to.equal(0)
              done()
            })
            .catch(done)
        })
      })
    })
  })
})
