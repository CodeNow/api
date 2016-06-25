'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')
var keypather = require('keypather')()

var Neo4j = require('runna4j')
var error = require('error')
var mongoose = require('mongoose')
var assign = require('101/assign')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var Version = require('models/mongo/context-version')
var pubsub = require('models/redis/pubsub')
var Promise = require('bluebird')

var mongoFactory = require('../../factories/mongo')
require('sinon-as-promised')(Promise)

var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.equal(expectedErr)
    done()
  }
}

function newObjectId () {
  return new mongoose.Types.ObjectId()
}

describe('Instance Model Tests', function () {
  var ownerCreatedByKeypaths = ['owner.username', 'owner.gravatar', 'createdBy.username', 'createdBy.gravatar']
  // jshint maxcomplexity:5
  var ctx

  beforeEach(function (done) {
    ctx = {}
    done()
  })
  describe('assertNotStartingOrStopping', function () {

    it('should error if no container', function (done) {
      var instance = mongoFactory.createNewInstance('no-container')
      instance.container = {}
      try {
        instance.assertNotStartingOrStopping()
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err.message).to.equal('Instance does not have a container')
        done()
      }
    })

    it('should error if container starting', function (done) {
      var instance = mongoFactory.createNewInstance('container-starting')
      instance.container.inspect.State.Starting = true
      try {
        instance.assertNotStartingOrStopping()
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err.message).to.equal('Instance is already starting')
        done()
      }
    })

    it('should error if container stopping', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.container.inspect.State.Stopping = true
      try {
        instance.assertNotStartingOrStopping()
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err.message).to.equal('Instance is already stopping')
        done()
      }
    })

    it('should return instance itself', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      var result = instance.assertNotStartingOrStopping()
      expect(result).to.equal(instance)
      done()
    })
  })

  describe('findOneStarting', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      done()
    })
    it('should find starting instance', function (done) {
      Instance.findOneStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOne)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Starting': {
            $exists: true
          }
        }
        sinon.assert.calledWith(Instance.findOne, query)
        done()
      })
    })
    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOne.yieldsAsync(mongoError)
      Instance.findOneStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOne)
        done()
      })
    })
    it('should return null if instance was not found', function (done) {
      Instance.findOne.yieldsAsync(null, null)
      Instance.findOneStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.be.null()
        sinon.assert.calledOnce(Instance.findOne)
        done()
      })
    })
  })

  describe('markAsStarting', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      done()
    })
    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })
    it('should mark instance as starting', function (done) {
      Instance.markAsStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Stopping': {
            $exists: false
          }
        }
        var $set = {
          $set: {
            'container.inspect.State.Starting': true
          }
        }
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, $set)
        done()
      })
    })
    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdate.yieldsAsync(mongoError)
      Instance.markAsStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
    it('should return an error if instance was not found', function (done) {
      Instance.findOneAndUpdate.yieldsAsync(null, null)
      Instance.markAsStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err.message).to.equal('Instance container has changed')
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
  })

  describe('findOneStopping', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      done()
    })
    it('should find stopping instance', function (done) {
      Instance.findOneStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOne)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Stopping': true
        }
        sinon.assert.calledWith(Instance.findOne, query)
        done()
      })
    })
    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOne.yieldsAsync(mongoError)
      Instance.findOneStopping(mockInstance._id, 'container-id', function (err) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOne)
        done()
      })
    })
    it('should return null if instance was not found', function (done) {
      Instance.findOne.yieldsAsync(null, null)
      Instance.findOneStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.be.null()
        sinon.assert.calledOnce(Instance.findOne)
        done()
      })
    })
  })

  describe('markAsStopping', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      done()
    })
    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })
    it('should mark instance as stopping', function (done) {
      Instance.markAsStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Starting': {
            $exists: false
          }
        }
        var $set = {
          $set: {
            'container.inspect.State.Stopping': true
          }
        }
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, $set)
        done()
      })
    })
    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdate.yieldsAsync(mongoError)
      Instance.markAsStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
    it('should return an error if instance was not found', function (done) {
      Instance.findOneAndUpdate.yieldsAsync(null, null)
      Instance.markAsStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err.message).to.equal('Instance container has changed')
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
  })

  describe('#findInstancesBuiltByDockerHost', function () {
    var testHost = 'http://10.0.0.1:4242'
    var instances = [
      {
        _id: 1
      },
      {
        _id: 2
      }
    ]
    beforeEach(function (done) {
      sinon.stub(Instance, 'find').yieldsAsync(null, instances)
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      done()
    })
    it('should get all instances from testHost', function (done) {
      Instance.findInstancesBuiltByDockerHost(testHost, function (err, foundInstances) {
        expect(err).to.be.null()
        expect(foundInstances).to.equal(instances)
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(Instance.find, {
          'container.dockerHost': testHost,
          'contextVersion.build.completed': { $exists: true }
        })
        done()
      })
    })
    it('should return an error if mongo fails', function (done) {
      var error = new Error('Mongo Error')
      Instance.find.yieldsAsync(error)
      Instance.findInstancesBuiltByDockerHost(testHost, function (err, foundInstances) {
        sinon.assert.calledOnce(Instance.find)
        expect(err).to.equal(error)
        expect(foundInstances).to.not.exist()
        done()
      })
    })
  }) // end findInstancesBuiltByDockerHost

  describe('getMainBranchName', function () {
    it('should return null when there is no main AppCodeVersion', function (done) {
      var instance = mongoFactory.createNewInstance('no-main-app-code-version')
      instance.contextVersion.appCodeVersions[0].additionalRepo = true
      expect(Instance.getMainBranchName(instance)).to.be.null()
      done()
    })

    it('should return the main AppCodeVersion', function (done) {
      var expectedBranchName = 'somebranchomg'
      var instance = mongoFactory.createNewInstance('no-main-app-code-version', {
        branch: expectedBranchName
      })
      expect(Instance.getMainBranchName(instance)).to.equal(expectedBranchName)
      done()
    })
  })

  describe('#updateContextVersion', function () {
    var id = '1234'
    var updateObj = {
      dockRemoved: false
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'update').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.update.restore()
      done()
    })
    it('should call the update command in mongo', function (done) {
      Instance.updateContextVersion(id, updateObj, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.update)
        sinon.assert.calledWith(Instance.update, {
          'contextVersion.id': id
        }, {
          $set: {
            'contextVersion.dockRemoved': false
          }
        }, {
          multi: true
        }, sinon.match.func)
        done()
      })
    })

    describe('when mongo fails', function () {
      var error = new Error('Mongo Error')
      beforeEach(function (done) {
        Instance.update.yieldsAsync(error)
        done()
      })
      it('should return the error', function (done) {
        Instance.updateContextVersion(id, updateObj, function (err) {
          expect(err).to.equal(error)
          done()
        })
      })
    })
  })

  describe('invalidateContainerDNS', function () {
    var instance

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance('a', {})
      sinon.stub(pubsub, 'publish')
      done()
    })

    afterEach(function (done) {
      pubsub.publish.restore()
      done()
    })

    it('should not invalidate without a docker host', function (done) {
      delete instance.container.dockerHost
      instance.invalidateContainerDNS()
      expect(pubsub.publish.callCount).to.equal(0)
      done()
    })

    it('should not invalidate without a local ip address', function (done) {
      delete instance.container.inspect.NetworkSettings.IPAddress
      instance.invalidateContainerDNS()
      expect(pubsub.publish.callCount).to.equal(0)
      done()
    })

    it('should not invalidate with a malformed docker host ip', function (done) {
      instance.container.dockerHost = 'skkfksrandom'
      instance.invalidateContainerDNS()
      expect(pubsub.publish.callCount).to.equal(0)
      done()
    })

    it('should publish the correct invalidation event via redis', function (done) {
      var hostIp = '10.20.128.1'
      var localIp = '172.17.14.55'
      var instance = mongoFactory.createNewInstance('b', {
        dockerHost: 'http://' + hostIp + ':4242',
        IPAddress: localIp
      })
      instance.invalidateContainerDNS()
      expect(pubsub.publish.calledOnce).to.be.true()
      expect(pubsub.publish.calledWith(
        process.env.REDIS_DNS_INVALIDATION_KEY + ':' + hostIp,
        localIp
      )).to.be.true()
      done()
    })
  })

  describe('fetchMatchingInstancesForDepChecking', function () {
    var ownerName = 'someowner'
    var isolationId = newObjectId()
    var instance

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance('wooosh', {
        isolated: isolationId
      })
      done()
    })

    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    describe('Error testing', function () {
      it('should be fine with an empty array result', function (done) {
        sinon.stub(Instance, 'find').yieldsAsync(null, [])
        instance.fetchMatchingInstancesForDepChecking(ownerName)
          .then(function (instances) {
            expect(instances.length).to.equal(0)
            sinon.assert.calledWith(
              Instance.find,
              {
                'owner.github': instance.owner.github,
                masterPod: true
              }
            )
          })
          .asCallback(done)
      })
      it('should throw error from Mongo', function (done) {
        var error = new Error('error')
        sinon.stub(Instance, 'find').yieldsAsync(error)
        instance.fetchMatchingInstancesForDepChecking(ownerName, true)
          .asCallback(function (err) {
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('Test query creation', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'find').yieldsAsync(null, [instance])
        done()
      })

      it('should query for masterpods', function (done) {
        instance.fetchMatchingInstancesForDepChecking(ownerName)
          .then(function (instances) {
            expect(instances[0]).to.deep.equal(assign(instance, {
              hostname: instance.getElasticHostname(ownerName)
            }))
            sinon.assert.calledWith(
              Instance.find,
              {
                'owner.github': instance.owner.github,
                masterPod: true
              }
            )
          })
          .asCallback(done)
      })

      it('should query for isolated containers', function (done) {
        instance.fetchMatchingInstancesForDepChecking(ownerName, true)
          .then(function (instances) {
            expect(instances[0]).to.deep.equal(assign(instance, {
              hostname: instance.getElasticHostname(ownerName)
            }))
            sinon.assert.calledWith(Instance.find,
              {
                'owner.github': instance.owner.github,
                isolated: isolationId
              }
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('getHostnamesFromEnvsAndFnr', function () {
    var ownerName = 'someowner'

    it('should be fine with an empty array result', function (done) {
      var instanceWithOnlyEnvs = mongoFactory.createNewInstance('instanceWithOnlyEnvs', {
        env: [
          'as=hello-staging-' + ownerName + '.runnableapp.com',
          'df=adelle-staging-' + ownerName + '.runnableapp.com'
        ]
      })
      var hostnames = instanceWithOnlyEnvs.getHostnamesFromEnvsAndFnr()
      expect(hostnames).to.deep.equal([
        'hello-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com'
      ])
      done()
    })
    it('should be fine with an empty array result', function (done) {
      var instanceWithOnlyFnR = mongoFactory.createNewInstance('instanceWithOnlyFnR')
      keypather.set(instanceWithOnlyFnR, 'contextVersion.appCodeVersions[0].transformRules.replace', [
        {
          find: 'hello',
          replace: 'hello-staging-' + ownerName + '.runnableapp.com'
        },
        {
          find: 'youthere',
          replace: 'adelle-staging-' + ownerName + '.runnableapp.com'
        }
      ])
      var hostnames = instanceWithOnlyFnR.getHostnamesFromEnvsAndFnr()
      expect(hostnames).to.deep.equal([
        'hello-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com'
      ])
      done()
    })

    it('should grab hostnames from both envs and FnR', function (done) {
      var instanceWithBoth = mongoFactory.createNewInstance('instanceWithBoth', {
        env: [
          'as=hello-staging-' + ownerName + '.runnableapp.com',
          'df=adelle-staging-' + ownerName + '.runnableapp.com'
        ]
      })
      keypather.set(instanceWithBoth, 'contextVersion.appCodeVersions[0].transformRules.replace', [
        {
          find: 'hello',
          replace: 'hello2-staging-' + ownerName + '.runnableapp.com'
        },
        {
          find: 'youthere',
          replace: 'adelle-staging-' + ownerName + '.runnableapp.com'
        }
      ])

      var hostnames = instanceWithBoth.getHostnamesFromEnvsAndFnr()
      expect(hostnames).to.deep.equal([
        'hello2-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com',
        'hello-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com' // repeat hosts are expected
      ])
      done()
    })
  })

  describe('setDependenciesFromEnvironment', function () {
    var ownerName = 'someowner'
    var instance

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance('wooosh')
      sinon.spy(instance, 'invalidateContainerDNS')
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      instance.getDependencies.restore()
      Instance.find.restore()
      done()
    })

    describe('Test invalidating cache entries', function () {
      beforeEach(function (done) {
        sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
        sinon.stub(Instance, 'find').yieldsAsync(null, [])
        done()
      })

      it('should invalidate dns cache entries', function (done) {
        instance.setDependenciesFromEnvironment(ownerName, function (err) {
          if (err) {
            done(err)
          }
          expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
          done()
        })
      })
    })

    describe('Testing changes in connections', function () {
      var masterInstances
      beforeEach(function (done) {
        masterInstances = [
          mongoFactory.createNewInstance('hello', {masterPod: true}),
          mongoFactory.createNewInstance('adelle', {masterPod: true})
        ]
        sinon.stub(Instance, 'find').yieldsAsync(null, masterInstances)
        sinon.stub(instance, 'addDependency').yieldsAsync()
        sinon.stub(instance, 'removeDependency').yieldsAsync()
        done()
      })
      afterEach(function (done) {
        instance.addDependency.restore()
        instance.removeDependency.restore()
        done()
      })
      describe('Envs', function () {
        it('should add a new dep for each env, when starting with none', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com',
            'df=adelle-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              'adelle-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should not allow it to add itself', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          instance.hostname = 'hello-staging-' + ownerName + '.runnableapp.com'
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [masterInstances[1]])
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com',
            'df=adelle-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should remove one of the existing, but leave the other', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances)
          instance.env = [
            'df=adelle-staging-' + ownerName + '.runnableapp.com' // Keep masterInstance[1]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              sinon.match.func
            )
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should remove both of the existing', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances)
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [masterInstances[1]])
          instance.env = [
            'df=hello-staging-' + ownerName + '.runnableapp.com' // Add masterInstance[0]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledOnce(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {masterPod: true}))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {masterPod: true}))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {masterPod: true}))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {masterPod: true})) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.env = [
            'df=hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
            'asd=chicken-staging-' + ownerName + '.runnableapp.com', // add masterInstance[3]
            'asfgas=potatoes-staging-' + ownerName + '.runnableapp.com' // add masterInstance[5]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[2].shortHash),
              sinon.match.func
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[3].shortHash),
              'chicken-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[5].shortHash),
              'potatoes-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
      })
      describe('FnR', function () {
        it('should add a new dep for each replace rule, when starting with none', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          var firstAppCodeVersion = keypather.get(instance, 'contextVersion.appCodeVersions[0]')
          firstAppCodeVersion.transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com',
              exclude: []
            },
            {
              action: 'Replace',
              search: 'chicken',
              replace: 'adelle-staging-' + ownerName + '.runnableapp.com',
              exclude: []
            }
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash),
              'hello-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              'adelle-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {masterPod: true}))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {masterPod: true}))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {masterPod: true}))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {masterPod: true})) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.contextVersion.appCodeVersions[0].transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
              exclude: []
            },
            {
              action: 'Replace',
              search: 'chicken',
              replace: 'chicken-staging-' + ownerName + '.runnableapp.com', // add masterInstance[3]
              exclude: []
            }
          ]
          instance.contextVersion.appCodeVersions[1].transformRules.replace = [
            {
              action: 'Replace',
              search: 'potatoes',
              replace: 'http://potatoes-staging-' + ownerName + '.runnableapp.com', // add masterInstance[5]
              exclude: []
            }
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[2].shortHash),
              sinon.match.func
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[3].shortHash),
              'chicken-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[5].shortHash),
              'potatoes-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
      })
      describe('Working with both envs and FnR', function () {
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {masterPod: true}))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {masterPod: true}))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {masterPod: true}))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {masterPod: true})) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.contextVersion.appCodeVersions[0].transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
              exclude: []
            }
          ]
          instance.contextVersion.appCodeVersions[1].transformRules.replace = [
            {
              action: 'Replace',
              search: 'potatoes',
              replace: 'http://potatoes-staging-' + ownerName + '.runnableapp.com', // add masterInstance[5]
              exclude: []
            }
          ]
          instance.env = [
            'asd=chicken-staging-' + ownerName + '.runnableapp.com' // add masterInstance[3]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[1].shortHash),
              sinon.match.func
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[2].shortHash),
              sinon.match.func
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[5].shortHash),
              'potatoes-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[3].shortHash),
              'chicken-staging-' + ownerName + '.runnableapp.com',
              sinon.match.func
            )
            done()
          })
        })
      })
    })
  })

  describe('removeDependency', function () {
    var instance = mongoFactory.createNewInstance('boooush')
    var dependant = mongoFactory.createNewInstance('mighty')

    beforeEach(function (done) {
      sinon.spy(instance, 'invalidateContainerDNS')
      sinon.stub(Neo4j.prototype, 'deleteConnection').yieldsAsync()
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      Neo4j.prototype.deleteConnection.restore()
      done()
    })

    it('should invalidate dns cache entries', function (done) {
      instance.removeDependency(dependant, function (err) {
        if (err) { done(err) }
        expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
        done()
      })
    })
  })

  describe('addDefaultIsolationOpts', function () {
    it('should add default options for Isolation', function (done) {
      var opts = {}
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        $or: [
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      // enforce the function returns a new object, not the same one
      expect(opts).to.deep.equal({})
      opts = { isolated: 4 }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({ isolated: 4 })
      opts = { isIsolationGroupMaster: true }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        isIsolationGroupMaster: true
      })
      opts = { $or: [{ value: 4 }] }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        $or: [
          { value: 4 },
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      done()
    })

    it('should not add them when looking up by lowerName', function (done) {
      var opts = {}
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        $or: [
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      // enforce the function returns a new object, not the same one
      expect(opts).to.deep.equal({})
      // check by lowerName
      opts = { lowerName: 'foobar' }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        lowerName: 'foobar'
      })
      done()
    })
  })

  describe('#emitInstanceUpdates', function () {
    function createMockInstance () {
      return new Instance()
    }
    beforeEach(function (done) {
      ctx.query = {}
      ctx.mockSessionUser = {}
      ctx.mockInstances = [
        createMockInstance(),
        createMockInstance(),
        createMockInstance()
      ]
      sinon.stub(Instance, 'find')
      sinon.stub(Instance.prototype, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      Instance.prototype.emitInstanceUpdate.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        var mockInstances = ctx.mockInstances
        Instance.find.yieldsAsync(null, mockInstances)
        Instance.prototype.emitInstanceUpdate
          .onCall(0).yieldsAsync(null, mockInstances[0])
          .onCall(1).yieldsAsync(null, mockInstances[1])
          .onCall(2).yieldsAsync(null, mockInstances[2])
        done()
      })
      it('should emit instance updates', function (done) {
        Instance.emitInstanceUpdates(ctx.mockSessionUser, ctx.query, 'update', function (err, instances) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Instance.find,
            ctx.query,
            sinon.match.func
          )
          ctx.mockInstances.forEach(function (mockInstance) {
            sinon.assert.calledOn(
              Instance.prototype.emitInstanceUpdate,
              mockInstance
            )
          })
          sinon.assert.calledWith(
            Instance.prototype.emitInstanceUpdate,
            ctx.mockSessionUser,
            'update'
          )
          expect(instances).to.deep.equal(ctx.mockInstances)
          done()
        })
      })
    })

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })
      describe('find errors', function () {
        beforeEach(function (done) {
          Instance.find.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          Instance.emitInstanceUpdates(ctx.mockSessionUser, ctx.query, 'update', expectErr(ctx.err, done))
        })
      })
      describe('emitInstanceUpdate errors', function () {
        beforeEach(function (done) {
          Instance.find.yieldsAsync(null, ctx.mockInstances)
          Instance.prototype.emitInstanceUpdate.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          Instance.emitInstanceUpdates(ctx.mockSessionUser, ctx.query, 'update', expectErr(ctx.err, done))
        })
      })
    })
  })

  describe('populateOwnerAndCreatedBy', function () {
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        accounts: {
          github: {
            id: 1234
          }
        }
      }
      ctx.instance = mongoFactory.createNewInstance()
      sinon.stub(ctx.instance, 'update').yieldsAsync(null)
      ctx.mockSessionUser.findGithubUserByGithubId = sinon.stub().yieldsAsync(null, {
        login: 'TEST-login',
        avatar_url: 'TEST-avatar_url'
      })
      done()
    })
    afterEach(function (done) {
      ctx.instance.update.restore()
      done()
    })
    describe('when owner and created by don\'t exist', function () {
      beforeEach(function (done) {
        keypather.set(ctx.instance, 'owner.github', 1234)
        keypather.set(ctx.instance, 'createdBy.github', 5678)
        done()
      })
      it('should populate the owner and created by', function (done) {
        ctx.instance.populateOwnerAndCreatedBy(ctx.mockSessionUser, function (err) {
          expect(err).to.not.exist()
          expect(ctx.instance.owner.username).to.equal('TEST-login')
          expect(ctx.instance.createdBy.username).to.equal('TEST-login')
          expect(ctx.instance.owner.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance.createdBy.gravatar).to.equal('TEST-avatar_url')
          sinon.assert.calledTwice(ctx.mockSessionUser.findGithubUserByGithubId)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance.owner.github)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance.createdBy.github)
          done()
        })
      })
    })
    describe('when there is an error fetching github user by github id', function () {
      var testErr = new Error('Test Error!')
      beforeEach(function (done) {
        ctx.mockSessionUser.findGithubUserByGithubId.yieldsAsync(testErr)
        done()
      })
      it('should pass through the error', function (done) {
        ctx.instance.populateOwnerAndCreatedBy(ctx.mockSessionUser, function (err) {
          expect(err).to.exist()
          expect(err).to.equal(testErr)
          done()
        })
      })
    })
    describe('when owner and created by exist', function () {
      beforeEach(function (done) {
        ownerCreatedByKeypaths.forEach(function (path) {
          keypather.set(ctx.instance, path, 'TEST-' + path)
        })
        keypather.set(ctx.instance, 'owner.github', 1234)
        keypather.set(ctx.instance, 'createdBy.github', 5678)
        done()
      })
      it('should do nothing!', function (done) {
        ctx.instance.populateOwnerAndCreatedBy(ctx.mockSessionUser, function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(ctx.mockSessionUser.findGithubUserByGithubId)
          done()
        })
      })
    })
  })

  describe('#populateOwnerAndCreatedByForInstances', function () {
    beforeEach(function (done) {
      ctx.instance1 = mongoFactory.createNewInstance()
      ctx.instance2 = mongoFactory.createNewInstance()
      ctx.instances = [ctx.instance1, ctx.instance2]
      ctx.mockSessionUser = {
        findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
          login: 'TEST-login',
          avatar_url: 'TEST-avatar_url'
        }),
        accounts: {
          github: {
            id: 1234
          }
        }
      }
      done()
    })

    describe('when instances are all populated', function () {
      beforeEach(function (done) {
        ownerCreatedByKeypaths.forEach(function (path) {
          keypather.set(ctx.instance1, path, 'TEST-' + path)
          keypather.set(ctx.instance2, path, 'TEST-' + path)
        })
        keypather.set(ctx.instance1, 'owner.github', 1234)
        keypather.set(ctx.instance1, 'createdBy.github', 5678)
        keypather.set(ctx.instance2, 'owner.github', 1234)
        keypather.set(ctx.instance2, 'createdBy.github', 5678)
        done()
      })
      it('should do nothing!', function (done) {
        Instance.populateOwnerAndCreatedByForInstances(ctx.mockSessionUser, ctx.instances, function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(ctx.mockSessionUser.findGithubUserByGithubId)
          done()
        })
      })
    })

    describe('when instances are not all populated', function () {
      beforeEach(function (done) {
        keypather.set(ctx.instance1, 'owner.github', 1234)
        keypather.set(ctx.instance1, 'createdBy.github', 5678)
        keypather.set(ctx.instance2, 'owner.github', 1234)
        keypather.set(ctx.instance2, 'createdBy.github', 5678)
        done()
      })
      it('should fetch github user and populate', function (done) {
        Instance.populateOwnerAndCreatedByForInstances(ctx.mockSessionUser, ctx.instances, function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(ctx.mockSessionUser.findGithubUserByGithubId)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance1.owner.github)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance1.createdBy.github)

          expect(ctx.instance1.owner.username).to.equal('TEST-login')
          expect(ctx.instance2.owner.username).to.equal('TEST-login')
          expect(ctx.instance1.createdBy.username).to.equal('TEST-login')
          expect(ctx.instance2.createdBy.username).to.equal('TEST-login')
          expect(ctx.instance1.owner.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance2.owner.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance1.createdBy.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance2.createdBy.gravatar).to.equal('TEST-avatar_url')
          done()
        })
      })
    })

    describe('when there is an error fetching github user by github id', function () {
      var testErr = new Error('Test Error!')
      beforeEach(function (done) {
        ctx.mockSessionUser.findGithubUserByGithubId.yieldsAsync(testErr)
        done()
      })
      it('should ignore the error completely and just keep going', function (done) {
        Instance.populateOwnerAndCreatedByForInstances(ctx.mockSessionUser, ctx.instances, function (err) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
  })

  /**
   * These tests are a little complicated due to the actual function doing extra async work after
   * the cb resolves.  A stub and a counter are used on the instance findOneAndUpdate to track
   * when everything is done
   */
  describe('.populateModels', function () {
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        _id: 1234,
        accounts: {
          github: {
            id: 1234
          }
        }
      }
      ctx.cvAttrs = {
        name: 'name1',
        owner: {
          github: '2335750'
        },
        createdBy: {
          github: '146592'
        },
        build: {
          _id: '23412312h3nk1lj2h3l1k2',
          completed: true
        }
      }
      ctx.mockContextVersion = mongoFactory.createNewVersion(ctx.cvAttrs)
      ctx.buildAttrs = {
        name: 'name1',
        owner: {
          github: '2335750'
        },
        createdBy: {
          github: '146592'
        }
      }
      ctx.mockBuild = new Build(ctx.buildAttrs)
      ctx.mockInstance = mongoFactory.createNewInstance('hello', {
        contextVersion: ctx.mockContextVersion,
        build: ctx.mockBuild._id
      })
      done()
    })
    beforeEach(function (done) {
      ctx.mockSessionUser.findGithubUserByGithubId = sinon.stub().yieldsAsync(null, {
        login: 'TEST-login',
        avatar_url: 'TEST-avatar_url'
      })
      done()
    })
    afterEach(function (done) {
      done()
    })

    describe('when instances are not all populated', function () {
      beforeEach(function (done) {
        sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
        sinon.stub(Build, 'findAsync').resolves([ctx.mockBuild])
        done()
      })
      afterEach(function (done) {
        ContextVersion.findAsync.restore()
        Build.findAsync.restore()
        done()
      })
      it('should fetch build and cv, then update the cv', function (done) {
        Instance.populateModels([ctx.mockInstance], function (err, instance) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ContextVersion.findAsync)
          sinon.assert.calledOnce(Build.findAsync)
          done()
        })
      })
      it('should handle when 2 instances share a cv', function (done) {
        ctx.mockInstance2 = mongoFactory.createNewInstance('hello2', {
          contextVersion: ctx.mockContextVersion,
          build: ctx.mockBuild._id
        })

        Instance.populateModels([ctx.mockInstance, ctx.mockInstance2], function (err, instances) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(ContextVersion.findAsync)
          sinon.assert.calledOnce(Build.findAsync)
          expect(instances.length).to.equal(2)
          expect(instances[0].contextVersion.id, 'instance 1').to.equal(ctx.mockContextVersion.id)
          expect(instances[1].contextVersion.id, 'instance 2').to.equal(ctx.mockContextVersion.id)
          done()
        })
      })
    })

    describe('when errors happen', function () {
      var testErr = new Error('Test Error!')
      beforeEach(function (done) {
        sinon.stub(error, 'log')
        done()
      })
      afterEach(function (done) {
        error.log.restore()
        done()
      })

      describe('when an instance is missing its container Inspect', function () {
        beforeEach(function (done) {
          sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
          sinon.stub(Build, 'findAsync').resolves([ctx.mockBuild])
          done()
        })
        afterEach(function (done) {
          ContextVersion.findAsync.restore()
          Build.findAsync.restore()
          done()
        })
        it('should log the bad instance and keep going', function (done) {
          ctx.mockInstance2 = mongoFactory.createNewInstance('hello2', {
            contextVersion: ctx.mockContextVersion,
            build: ctx.mockBuild._id
          })
          ctx.mockInstance2.container = {
            dockerContainer: 'asdasdasdsad'
          }
          Instance.populateModels([ctx.mockInstance, ctx.mockInstance2], function (err, instances) {
            expect(err).to.not.exist()
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(ContextVersion.findAsync)
            sinon.assert.calledOnce(Build.findAsync)
            sinon.assert.calledOnce(error.log)
            sinon.assert.calledWith(
              error.log,
              sinon.match.has('message', 'instance missing inspect data' + ctx.mockInstance2._id)
            )
            done()
          })
        })
      })
      describe('when a failure happens during a db query', function () {
        beforeEach(function (done) {
          sinon.stub(Instance, 'findOneAndUpdateAsync').resolves(null)
          done()
        })
        afterEach(function (done) {
          Instance.findOneAndUpdateAsync.restore()
          done()
        })
        describe('CV.find', function () {
          beforeEach(function (done) {
            sinon.stub(Build, 'findAsync').resolves([ctx.mockBuild])
            sinon.stub(ContextVersion, 'find').yieldsAsync(testErr)
            done()
          })
          afterEach(function (done) {
            ContextVersion.find.restore()
            Build.findAsync.restore()
            done()
          })
          it('should return error', function (done) {
            Instance.populateModels([ctx.mockInstance], function (err) {
              expect(err).to.exist()
              setTimeout(function () {
                sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
                done()
              })
            })
          })
        })
        describe('Build.find', function () {
          beforeEach(function (done) {
            sinon.stub(Build, 'find').yieldsAsync(testErr)
            sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
            done()
          })
          afterEach(function (done) {
            ContextVersion.findAsync.restore()
            Build.find.restore()
            done()
          })
          it('should return error', function (done) {
            Instance.populateModels([ctx.mockInstance], function (err) {
              expect(err).to.exist()
              setTimeout(function () {
                sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
                done()
              })
            })
          })
        })
      })
    })
  })

  describe('updateCv', function () {
    beforeEach(function (done) {
      ctx.instance = mongoFactory.createNewInstance()
      ctx.mockCv = mongoFactory.createNewVersion({})
      sinon.stub(Version, 'findById').yieldsAsync(null, ctx.mockCv)
      sinon.stub(ctx.instance, 'update').yieldsAsync(null)
      done()
    })

    afterEach(function (done) {
      Version.findById.restore()
      done()
    })

    it('should update the context version', function (done) {
      var originalCvId = ctx.instance.contextVersion._id
      ctx.instance.updateCv(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Version.findById)
        sinon.assert.calledWith(Version.findById, originalCvId, {'build.log': 0}, sinon.match.func)
        sinon.assert.calledOnce(ctx.instance.update)
        sinon.assert.calledWith(ctx.instance.update, {
          $set: {
            contextVersion: ctx.mockCv.toJSON()
          }
        }, sinon.match.func)
        done()
      })
    })

    describe('when the db fails', function () {
      var TestErr = new Error('Test Err')
      beforeEach(function (done) {
        Version.findById.yieldsAsync(TestErr)
        done()
      })
      it('should pass the error through', function (done) {
        ctx.instance.updateCv(function (err) {
          expect(err).to.equal(TestErr)
          sinon.assert.notCalled(ctx.instance.update)
          done()
        })
      })
    })

    describe('when there are not found context versions', function () {
      beforeEach(function (done) {
        Version.findById.yieldsAsync(null, null)
        done()
      })
      it('should throw the error', function (done) {
        ctx.instance.updateCv(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/no.context.version.found/i)
          sinon.assert.notCalled(ctx.instance.update)
          done()
        })
      })
    })
  })

  describe('.isolate', function () {
    var mockIsolationId = 'deadbeefdeadbeefdeadbeef'
    var mockInstance = {}
    var instance

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      instance = mongoFactory.createNewInstance('sample')
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationId', function (done) {
        instance.isolate().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolate requires isolationid/i)
          done()
        })
      })

      it('should require an object ID for isolationId', function (done) {
        instance.isolate('hi').asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolate.+objectid.+isolationid/i)
          done()
        })
      })

      it('should reject with any update error', function (done) {
        var error = new Error('pugsly')
        Instance.findOneAndUpdate.yieldsAsync(error)
        instance.isolate(mockIsolationId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should update the instance to the database', function (done) {
      instance.isolate(mockIsolationId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          sinon.match.object,
          sinon.match.func
        )
        done()
      })
    })

    it('should update the instance w/ master false by default', function (done) {
      instance.isolate(mockIsolationId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $set: {
              isolated: mockIsolationId,
              isIsolationGroupMaster: false
            }
          },
          sinon.match.func
        )
        done()
      })
    })

    it('should update the instance w/ master true if supplied', function (done) {
      instance.isolate(mockIsolationId, true).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $set: {
              isolated: mockIsolationId,
              isIsolationGroupMaster: true
            }
          },
          sinon.match.func
        )
        done()
      })
    })

    it('should return the updated instance from the update', function (done) {
      instance.isolate(mockIsolationId).asCallback(function (err, updatedInstance) {
        expect(err).to.not.exist()
        expect(updatedInstance).to.equal(mockInstance)
        done()
      })
    })
  })

  describe('.deIsolate', function () {
    var mockInstance = {}
    var instance

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      instance = mongoFactory.createNewInstance('sample')
      instance.isolated = 'deadbeefdeadbeefdeadbeef'
      instance.isIsolationGroupMaster = true
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with update errors', function (done) {
        var error = new Error('pugsly')
        Instance.findOneAndUpdate.yieldsAsync(error)
        instance.deIsolate().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should update the instance', function (done) {
      instance.deIsolate().asCallback(function (err, updatedInstance) {
        expect(err).to.not.exist()
        expect(updatedInstance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $unset: {
              isolated: true,
              isIsolationGroupMaster: true
            }
          },
          sinon.match.func
        )
        done()
      })
    })
  })

  describe('markAsStopping', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, { _id: 'some-id' })
      done()
    })
    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })
    it('should return found instance', function (done) {
      var query = {
        _id: 'some-id',
        'container.dockerContainer': 'container-id',
        'container.inspect.State.Starting': {
          $exists: false
        }
      }
      var update = {
        $set: {
          'container.inspect.State.Stopping': true
        }
      }
      Instance.markAsStopping('some-id', 'container-id', function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, update)
        done()
      })
    })
    it('should return error if query failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdate.yieldsAsync(mongoError)
      var query = {
        _id: 'some-id',
        'container.dockerContainer': 'container-id',
        'container.inspect.State.Starting': {
          $exists: false
        }
      }
      var update = {
        $set: {
          'container.inspect.State.Stopping': true
        }
      }
      Instance.markAsStopping('some-id', 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, update)
        done()
      })
    })
  })

  describe('findIsolationMaster', function () {
    var id = '571b39b9d35173300021667d'
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findIsolationMaster(id, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(
          Instance.findOne,
          {
            isolated: id,
            isIsolationGroupMaster: true
          }
        )
        done()
      })
    })

    it('should return any errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.findOne.yieldsAsync(dbErr)
      Instance.findIsolationMaster(id, function (err) {
        expect(err).to.exist()
        expect(err).to.equal(dbErr)
        done()
      })
    })
  })

  describe('#findInstancesInIsolationWithSameRepoAndBranch', function () {
    var id = '571b39b9d35173300021667d'
    var repo = 'repoName'
    var branch = 'brancName'
    beforeEach(function (done) {
      sinon.stub(Instance, 'find').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findInstancesInIsolationWithSameRepoAndBranch(id, repo, branch, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(
          Instance.find,
          {
            isolated: id,
            isIsolationGroupMaster: { $ne: true },
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should throw any database errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.find.yieldsAsync(dbErr)
      Instance.findInstancesInIsolationWithSameRepoAndBranch(id, repo, branch, function (err) {
        expect(err).to.exist()
        expect(err).to.equal(dbErr)
        done()
      })
    })
  })

  describe('findInstancesLinkedToBranch', function () {
    var repo = 'repoName'
    var branch = 'branchName'
    var contextId = newObjectId()
    beforeEach(function (done) {
      sinon.stub(Instance, 'find').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findInstancesLinkedToBranch(repo, branch, contextId, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(
          Instance.find,
          {
            'contextVersion.context': contextId,
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should not add the context ID if not passed', function (done) {
      Instance.findInstancesLinkedToBranch(repo, branch, null, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(
          Instance.find,
          {
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should handle the context ID being a string', function (done) {
      Instance.findInstancesLinkedToBranch(repo, branch, contextId.toString(), function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(
          Instance.find,
          {
            'contextVersion.context': contextId,
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should throw any database errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.find.yieldsAsync(dbErr)
      Instance.findInstancesLinkedToBranch(repo, branch, contextId, function (err) {
        expect(err).to.exist()
        expect(err).to.equal(dbErr)
        done()
      })
    })
  })
})
