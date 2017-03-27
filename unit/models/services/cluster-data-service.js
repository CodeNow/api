'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const expect = Code.expect
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const Instance = require('models/mongo/instance')
const ClusterDataService = require('models/services/cluster-data-service')

describe('Cluster Data Service Unit Tests', function () {
  const instanceId1 = '507f1f77bcf86cd799439011'
  const shortHash1 = 'abc123'
  const aig1Id = '107f1f77bcf86cd799439012'
  let instance1
  let aig1
  let clusterConfig1
  const instanceId2 = '007f1f77bcf86cd799439019'
  const shortHash2 = 'def456'
  const aig2Id = '007f1f77bcf86cd799439019'
  let instance2
  const instanceId3 = '007f1f77bcf86cd799439031'
  const shortHash3 = 'ghi789'
  let iccsByInstanceId
  let instance3
  let aig2
  let clusterConfig2
  let organization
  let sessionUser
  let ownerGitHubId
  beforeEach((done) => {
    organization = {id: 11111}
    sessionUser = {
      _id: 2222
    }
    ownerGitHubId = 9999
    instance1 = new Instance({ _id: instanceId1, shortHash: shortHash1 })
    aig1 = new AutoIsolationConfig({
      _id: objectId(aig1Id),
      instance: objectId(instanceId1)
    })
    clusterConfig1 = { autoIsolationConfigId: objectId(aig1Id) }
    instance2 = new Instance({ _id: instanceId2, shortHash: shortHash2 })
    aig2 = new AutoIsolationConfig({
      _id: objectId(aig2Id),
      instance: objectId(instanceId2)
    })
    clusterConfig2 = { autoIsolationConfigId: objectId(aig2Id) }
    instance3 = new Instance({ _id: instanceId3, shortHash: shortHash3, parent: shortHash1 })
    iccsByInstanceId = {}
    iccsByInstanceId[instanceId1] = clusterConfig1
    iccsByInstanceId[instanceId2] = clusterConfig2
    done()
  })

  describe('fetchInputClusterConfigsByAutoIsolationConfigs', () => {
    const instance1Id = '507f1f77bcf86cd799439011'
    const aig1Id = '107f1f77bcf86cd799439012'
    const instance2Id = '007f1f77bcf86cd799439019'
    const aig2Id = '007f1f77bcf86cd799439019'
    let aig1
    let clusterConfig1
    let aig2
    let clusterConfig2
    beforeEach((done) => {
      aig1 = new AutoIsolationConfig({
        _id: objectId(aig1Id),
        instance: objectId(instance1Id)
      })
      clusterConfig1 = new InputClusterConfig({
        autoIsolationConfigId: objectId(aig1Id)
      })
      aig2 = new AutoIsolationConfig({
        _id: objectId(aig2Id),
        instance: objectId(instance2Id)
      })
      clusterConfig2 = new InputClusterConfig({
        autoIsolationConfigId: objectId(aig2Id)
      })
      done()
    })

    beforeEach((done) => {
      sinon.stub(InputClusterConfig, 'findAllActive').resolves([clusterConfig1, clusterConfig2])
      done()
    })
    afterEach((done) => {
      InputClusterConfig.findAllActive.restore()
      done()
    })
    it('should return toJSONed versions of the fetched iccs, and have the added fields', () => {
      return ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs([aig1, aig2])
        .then(iccs => {
          expect(iccs.length).to.equal(2)
          expect(iccs[0]._doc).to.be.undefined()
          expect(iccs[0].masterInstanceId).to.equal(instance1Id)
          expect(iccs[0].autoIsolation).to.equal(aig1)
          expect(iccs[1]._doc).to.be.undefined()
          expect(iccs[1].masterInstanceId).to.equal(instance2Id)
          expect(iccs[1].autoIsolation).to.equal(aig2)
        })
    })
    it('should fetch the iccs with objectIds from the given configs', () => {
      return ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs([aig1, aig2])
        .then(() => {
          sinon.assert.calledWith(InputClusterConfig.findAllActive, {
            autoIsolationConfigId: {
              $in: [aig1._id, aig2._id]
            }
          })
        })
    })
  })

  describe('_mapIccsByInstanceId', () => {
    const instance1Id = '507f1f77bcf86cd799439011'
    const aig1Id = '107f1f77bcf86cd799439012'
    const instance2Id = '007f1f77bcf86cd799439019'
    let aig1
    let clusterConfig1
    let dep
    beforeEach((done) => {
      dep = { instance: objectId(instance2Id) }
      aig1 = {
        _id: objectId(aig1Id),
        instance: objectId(instance1Id),
        requestedDependencies: [ dep ]
      }
      clusterConfig1 = {
        autoIsolation: aig1,
        autoIsolationConfigId: objectId(aig1Id),
        masterInstanceId: instance1Id
      }
      done()
    })
    it('should put the icc in the dictionary under the main and dep instance id', done => {
      const given = {}
      const resultingDictionary = ClusterDataService._mapIccsByInstanceId(given, clusterConfig1)
      expect(resultingDictionary[instance1Id]).to.equal(clusterConfig1)
      expect(resultingDictionary[instance2Id]).to.equal(clusterConfig1)
      done()
    })
  })

  describe('_setClustersOnAllInstances', () => {
    let iccsByInstanceId
    beforeEach((done) => {
      iccsByInstanceId = {}
      iccsByInstanceId[instanceId1] = clusterConfig1
      iccsByInstanceId[instanceId2] = clusterConfig2
      done()
    })
    it('should set the cluster on the instance', done => {
      ClusterDataService._setClustersOnAllInstances(iccsByInstanceId, [instance1], [instance1])
      expect(instance1._doc.inputClusterConfig).to.equal(clusterConfig1)
      done()
    })

    it('should use the allInstances for finding the shortHash', done => {
      ClusterDataService._setClustersOnAllInstances(iccsByInstanceId, [instance3], [instance1, instance2, instance3])
      expect(instance3._doc.inputClusterConfig).to.equal(clusterConfig1)
      done()
    })
  })

  describe('populateInstanceWithClusterInfo', () => {
    beforeEach((done) => {
      sinon.stub(Instance, 'findInstanceIdByShortHash').resolves(instanceId1)
      sinon.stub(AutoIsolationConfig, 'findActiveByAnyInstanceId').resolves(aig1)
      sinon.stub(ClusterDataService, 'fetchInputClusterConfigsByAutoIsolationConfigs')
        .resolves([clusterConfig1])
      sinon.stub(ClusterDataService, '_setClusterOnInstance').returns()
      done()
    })
    afterEach((done) => {
      Instance.findInstanceIdByShortHash.restore()
      AutoIsolationConfig.findActiveByAnyInstanceId.restore()
      ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs.restore()
      ClusterDataService._setClusterOnInstance.restore()
      done()
    })
    describe('error functions', () => {
      it('should do nothing if instances are not defined', () => {
        return ClusterDataService.populateInstanceWithClusterInfo(null)
          .then(result => {
            expect(result).to.equal(null)
          })
      })

      it('should do nothing if instances are empty', () => {
        return ClusterDataService.populateInstanceWithClusterInfo([])
          .then(result => {
            expect(result).to.equal([])
          })
      })
    })
    describe('normal unisolated function', () => {
      beforeEach(() => {
        return ClusterDataService.populateInstanceWithClusterInfo(instance1)
      })
      it('should call everything in order ', done => {
        sinon.assert.callOrder(
          AutoIsolationConfig.findActiveByAnyInstanceId,
          ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs,
          ClusterDataService._setClusterOnInstance
        )
        done()
      })
      it('should call fetchInputClusterConfigsByAutoIsolationConfigs correctly', done => {
        sinon.assert.calledWith(
          ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs,
          [ aig1 ]
        )
        done()
      })
      it('should call _setClusterOnInstance correctly', done => {
        sinon.assert.calledWith(
          ClusterDataService._setClusterOnInstance,
          instance1,
          clusterConfig1
        )
        done()
      })
    })
    describe('normal isolated function', () => {
      beforeEach(() => {
        instance2._doc.isolated = '007f1f77bcf86cd799439019'
        return ClusterDataService.populateInstanceWithClusterInfo(instance2)
      })
      it('should call everything in order ', done => {
        sinon.assert.callOrder(
          Instance.findInstanceIdByShortHash,
          AutoIsolationConfig.findActiveByAnyInstanceId,
          ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs,
          ClusterDataService._setClusterOnInstance
        )
        done()
      })
    })
  })

  describe('populateInstancesWithClusterInfo', () => {
    beforeEach((done) => {
      sinon.stub(ClusterDataService, '_fetchParentsAndAddToArray').resolves([instance1, instance2, instance3])
      sinon.stub(AutoIsolationConfig, 'findActiveByAnyInstanceIds').resolves([aig1, aig2])
      sinon.stub(ClusterDataService, 'fetchInputClusterConfigsByAutoIsolationConfigs')
        .resolves([clusterConfig1, clusterConfig2])
      sinon.stub(ClusterDataService, '_mapIccsByInstanceId').returnsArg(0)
      sinon.stub(ClusterDataService, '_setClustersOnAllInstances').returns()
      done()
    })
    afterEach((done) => {
      ClusterDataService._fetchParentsAndAddToArray.restore()
      AutoIsolationConfig.findActiveByAnyInstanceIds.restore()
      ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs.restore()
      ClusterDataService._mapIccsByInstanceId.restore()
      ClusterDataService._setClustersOnAllInstances.restore()
      done()
    })
    describe('error functions', () => {
      it('should do nothing if instances are not defined', () => {
        return ClusterDataService.populateInstancesWithClusterInfo(null)
          .then(result => {
            expect(result).to.equal(null)
          })
      })

      it('should do nothing if instances are empty', () => {
        return ClusterDataService.populateInstancesWithClusterInfo([])
          .then(result => {
            expect(result).to.equal([])
          })
      })
    })

    describe('normal function', () => {
      let instances
      beforeEach(() => {
        instances = [ instance1, instance2 ]
        return ClusterDataService.populateInstancesWithClusterInfo(instances)
      })
      it('should call everything in order ', done => {
        sinon.assert.callOrder(
          AutoIsolationConfig.findActiveByAnyInstanceIds,
          ClusterDataService.fetchInputClusterConfigsByAutoIsolationConfigs,
          ClusterDataService._mapIccsByInstanceId,
          ClusterDataService._setClustersOnAllInstances
        )
        done()
      })
      it('should call _mapIccsByInstanceId on each icc', done => {
        sinon.assert.calledWith(
          ClusterDataService._mapIccsByInstanceId,
          sinon.match.object,
          clusterConfig1
        )
        sinon.assert.calledWith(
          ClusterDataService._mapIccsByInstanceId,
          sinon.match.object,
          clusterConfig2
        )
        done()
      })
    })
  })
})
