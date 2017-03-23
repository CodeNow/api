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
const UserService = require('models/services/user-service')

describe('Cluster Data Service Unit Tests', function () {
  describe('makeClusterData', () => {
    it('should return merged object', (done) => {
      const clusterId = '507f1f77bcf86cd799439011'
      const masterInstanceId = '107f1f77bcf86cd799439012'
      const inputCluster = new InputClusterConfig({ _id: objectId(clusterId) })
      const clusterData = ClusterDataService.makeClusterData(inputCluster, new AutoIsolationConfig({ instance: masterInstanceId }))
      expect(clusterData._id.toString()).to.equal(clusterId)
      expect(clusterData.masterInstanceId).to.equal(masterInstanceId)
      done()
    })
  })

  describe('populateInstanceWithClusterInfo', () => {
    const instanceId = '507f1f77bcf86cd799439011'
    const aigId = '107f1f77bcf86cd799439012'
    let instance
    let aig
    let clusterConfig
    beforeEach((done) => {
      instance = new Instance({ _id: instanceId })
      aig = new AutoIsolationConfig({
        _id: objectId(aigId),
        instance: objectId(instanceId)
      })
      clusterConfig = new InputClusterConfig({
        autoIsolationConfigId: objectId(aigId)
      })
      sinon.stub(AutoIsolationConfig, 'findActiveByAnyInstanceId').resolves(aig)
      sinon.stub(InputClusterConfig, 'findActiveByAutoIsolationId').resolves(clusterConfig)
      InputClusterConfig.findActiveByAutoIsolationId
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.findActiveByAnyInstanceId.restore()
      InputClusterConfig.findActiveByAutoIsolationId.restore()
      done()
    })

    it('should stop AutoIsolationConfig.findActiveByAnyInstanceId failed', (done) => {
      const error = new Error('Some error')
      AutoIsolationConfig.findActiveByAnyInstanceId.rejects(error)
      ClusterDataService.populateInstanceWithClusterInfo(instance)
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.not.exist()
        expect(instance._doc.inputClusterConfig).to.not.exist()
        sinon.assert.calledOnce(AutoIsolationConfig.findActiveByAnyInstanceId)
        sinon.assert.notCalled(InputClusterConfig.findActiveByAutoIsolationId)
        done()
      })
    })

    it('should stop InputClusterConfig.findActiveByAutoIsolationId failed', (done) => {
      const error = new Error('Some error')
      InputClusterConfig.findActiveByAutoIsolationId.rejects(error)
      ClusterDataService.populateInstanceWithClusterInfo(instance)
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.not.exist()
        expect(instance._doc.inputClusterConfig).to.not.exist()
        sinon.assert.calledOnce(AutoIsolationConfig.findActiveByAnyInstanceId)
        sinon.assert.calledOnce(InputClusterConfig.findActiveByAutoIsolationId)
        done()
      })
    })

    it('should return instance if success and updated original one', (done) => {
      const error = new Error('Some error')
      ClusterDataService.populateInstanceWithClusterInfo(instance)
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result._doc.inputClusterConfig).to.exist()
        expect(result._doc.inputClusterConfig._id).to.exist(clusterConfig._id.toString())
        expect(result._doc.inputClusterConfig.masterInstanceId).to.exist(instanceId)
        expect(instance._doc.inputClusterConfig).to.exist()
        expect(instance._doc.inputClusterConfig._id).to.exist(clusterConfig._id.toString())
        expect(instance._doc.inputClusterConfig.masterInstanceId).to.exist(instanceId)
        done()
      })
    })
    
    it('should call functions with correct args', (done) => {
      const error = new Error('Some error')
      ClusterDataService.populateInstanceWithClusterInfo(instance)
      .asCallback((err, result) => {
        sinon.assert.calledOnce(AutoIsolationConfig.findActiveByAnyInstanceId)
        sinon.assert.calledWithExactly(AutoIsolationConfig.findActiveByAnyInstanceId, instanceId)
        sinon.assert.calledOnce(InputClusterConfig.findActiveByAutoIsolationId)
        sinon.assert.calledWithExactly(InputClusterConfig.findActiveByAutoIsolationId, aigId)
        done()
      })
    })
  })

  describe('populateInstancesWithClusterInfo', () => {
    beforeEach((done) => {
      sinon.stub(UserService, 'getBpOrgInfoFromGitHubId').returns()
      sinon.stub(AutoIsolationConfig, 'findAsync').resolves()
      sinon.stub(InputClusterConfig, 'findAsync').resolves()
      done()
    })
    afterEach((done) => {
      UserService.getBpOrgInfoFromGitHubId.restore()
      AutoIsolationConfig.findAsync.restore()
      InputClusterConfig.findAsync.restore()
      done()
    })
    
    it('should do nothing if instances are not defined', (done) => {
      ClusterDataService.populateInstancesWithClusterInfo(null, {})
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.not.exist()
        sinon.assert.notCalled(UserService.getBpOrgInfoFromGitHubId)
        done()
      })
    })

    it('should do nothing if instances are empty', (done) => {
      ClusterDataService.populateInstancesWithClusterInfo([], {})
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.not.exist()
        sinon.assert.notCalled(UserService.getBpOrgInfoFromGitHubId)
        done()
      })
    })

    it('should do nothing if sessionUser is not defined', (done) => {
      ClusterDataService.populateInstancesWithClusterInfo([{_id: 1}, {_id: 2}], null)
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.not.exist()
        sinon.assert.notCalled(UserService.getBpOrgInfoFromGitHubId)
        done()
      })
    })
  })
})
