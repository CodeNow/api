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

  // describe('populateInstanceWithClusterInfo', () => {
  //   const instanceId = '507f1f77bcf86cd799439011'
  //   const aigId = '107f1f77bcf86cd799439012'
  //   let instance
  //   let aig
  //   let clusterConfig
  //   beforeEach((done) => {
  //     instance = new Instance({ _id: instanceId })
  //     aig = new AutoIsolationConfig({
  //       _id: objectId(aigId),
  //       instance: objectId(instanceId)
  //     })
  //     clusterConfig = new InputClusterConfig({
  //       autoIsolationConfigId: objectId(aigId)
  //     })
  //     sinon.stub(AutoIsolationConfig, 'findActiveByAnyInstanceId').resolves(aig)
  //     sinon.stub(InputClusterConfig, 'findActiveByAutoIsolationId').resolves(clusterConfig)
  //     InputClusterConfig.findActiveByAutoIsolationId
  //     done()
  //   })
  //   afterEach((done) => {
  //     AutoIsolationConfig.findActiveByAnyInstanceId.restore()
  //     InputClusterConfig.findActiveByAutoIsolationId.restore()
  //     done()
  //   })

  //   it('should stop AutoIsolationConfig.findActiveByAnyInstanceId failed', (done) => {
  //     const error = new Error('Some error')
  //     AutoIsolationConfig.findActiveByAnyInstanceId.rejects(error)
  //     ClusterDataService.populateInstanceWithClusterInfo(instance)
  //     .asCallback((err, result) => {
  //       expect(err).to.not.exist()
  //       expect(result).to.not.exist()
  //       expect(instance._doc.inputClusterConfig).to.not.exist()
  //       sinon.assert.calledOnce(AutoIsolationConfig.findActiveByAnyInstanceId)
  //       sinon.assert.notCalled(InputClusterConfig.findActiveByAutoIsolationId)
  //       done()
  //     })
  //   })

  //   it('should stop InputClusterConfig.findActiveByAutoIsolationId failed', (done) => {
  //     const error = new Error('Some error')
  //     InputClusterConfig.findActiveByAutoIsolationId.rejects(error)
  //     ClusterDataService.populateInstanceWithClusterInfo(instance)
  //     .asCallback((err, result) => {
  //       expect(err).to.not.exist()
  //       expect(result).to.not.exist()
  //       expect(instance._doc.inputClusterConfig).to.not.exist()
  //       sinon.assert.calledOnce(AutoIsolationConfig.findActiveByAnyInstanceId)
  //       sinon.assert.calledOnce(InputClusterConfig.findActiveByAutoIsolationId)
  //       done()
  //     })
  //   })

  //   it('should return instance if success and updated original one', (done) => {
  //     const error = new Error('Some error')
  //     ClusterDataService.populateInstanceWithClusterInfo(instance)
  //     .asCallback((err, result) => {
  //       expect(err).to.not.exist()
  //       expect(result._doc.inputClusterConfig).to.exist()
  //       expect(result._doc.inputClusterConfig._id).to.exist(clusterConfig._id.toString())
  //       expect(result._doc.inputClusterConfig.masterInstanceId).to.exist(instanceId)
  //       expect(instance._doc.inputClusterConfig).to.exist()
  //       expect(instance._doc.inputClusterConfig._id).to.exist(clusterConfig._id.toString())
  //       expect(instance._doc.inputClusterConfig.masterInstanceId).to.exist(instanceId)
  //       done()
  //     })
  //   })
    
  //   it('should call functions with correct args', (done) => {
  //     const error = new Error('Some error')
  //     ClusterDataService.populateInstanceWithClusterInfo(instance)
  //     .asCallback((err, result) => {
  //       sinon.assert.calledOnce(AutoIsolationConfig.findActiveByAnyInstanceId)
  //       sinon.assert.calledWithExactly(AutoIsolationConfig.findActiveByAnyInstanceId, instanceId)
  //       sinon.assert.calledOnce(InputClusterConfig.findActiveByAutoIsolationId)
  //       sinon.assert.calledWithExactly(InputClusterConfig.findActiveByAutoIsolationId, aigId)
  //       done()
  //     })
  //   })
  // })

  describe('populateInstancesWithClusterInfo', () => {
    const instance1Id = '507f1f77bcf86cd799439011'
    const aig1Id = '107f1f77bcf86cd799439012'
    let instance1
    let aig1
    let clusterConfig1
    const instance2Id = '007f1f77bcf86cd799439019'
    const aig2Id = '007f1f77bcf86cd799439019'
    let instance2
    let aig2
    let clusterConfig2
    let organization
    let sessionUser
    let ownerGitHubId
    beforeEach((done) => {
      organization = { id: 11111}
      sessionUser = {
        _id: 2222
      }
      ownerGitHubId = 9999
      instance1 = new Instance({ _id: instance1Id, owner: { github: ownerGitHubId } })
      aig1 = new AutoIsolationConfig({
        _id: objectId(aig1Id),
        instance: objectId(instance1Id)
      })
      clusterConfig1 = new InputClusterConfig({
        autoIsolationConfigId: objectId(aig1Id)
      })
      instance2 = new Instance({ _id: instance2Id, owner: { github: ownerGitHubId } })
      aig2 = new AutoIsolationConfig({
        _id: objectId(aig2Id),
        instance: objectId(instance2Id)
      })
      clusterConfig2 = new InputClusterConfig({
        autoIsolationConfigId: objectId(aig2Id)
      })
      sinon.stub(UserService, 'getBpOrgInfoFromGitHubId').returns(organization)
      sinon.stub(AutoIsolationConfig, 'findAllActive').resolves([aig1, aig2])
      sinon.stub(InputClusterConfig, 'findAllActive').resolves([clusterConfig1, clusterConfig2])
      done()
    })
    afterEach((done) => {
      UserService.getBpOrgInfoFromGitHubId.restore()
      AutoIsolationConfig.findAllActive.restore()
      InputClusterConfig.findAllActive.restore()
      done()
    })
    
    it('should do nothing if instances are not defined', (done) => {
      ClusterDataService.populateInstancesWithClusterInfo(null, {})
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.equal(null)
        sinon.assert.notCalled(UserService.getBpOrgInfoFromGitHubId)
        done()
      })
    })

    it('should do nothing if instances are empty', (done) => {
      ClusterDataService.populateInstancesWithClusterInfo([], {})
        .asCallback((err, result) => {
          expect(err).to.not.exist()
          expect(result).to.equal([])
          sinon.assert.notCalled(UserService.getBpOrgInfoFromGitHubId)
          done()
        })
    })

    it('should return instances if sessionUser is not defined', (done) => {
      const instances = [{_id: 1}, {_id: 2}]
      ClusterDataService.populateInstancesWithClusterInfo(instances, null)
        .asCallback((err, result) => {
          expect(err).to.not.exist()
          expect(result).to.equal(instances)
          sinon.assert.notCalled(UserService.getBpOrgInfoFromGitHubId)
          done()
        })
    })

    it('should stop if UserService.getBpOrgInfoFromGitHubId failed', (done) => {
      UserService.getBpOrgInfoFromGitHubId.throws(new Error('Some error'))
      const instances = [ instance1, instance2]
      ClusterDataService.populateInstancesWithClusterInfo(instances, sessionUser)
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.equal(instances)
        sinon.assert.calledOnce(UserService.getBpOrgInfoFromGitHubId)
        sinon.assert.notCalled(AutoIsolationConfig.findAllActive)
        sinon.assert.notCalled(InputClusterConfig.findAllActive)
        done()
      })
    })

    it('should stop if AutoIsolationConfig.findAllActive failed', (done) => {
      AutoIsolationConfig.findAllActive.throws(new Error('Some error'))
      const instances = [ instance1, instance2]
      ClusterDataService.populateInstancesWithClusterInfo(instances, sessionUser)
      .asCallback((err, result) => {
        expect(err).to.not.exist()
        expect(result).to.equal(instances)
        sinon.assert.calledOnce(UserService.getBpOrgInfoFromGitHubId)
        sinon.assert.calledOnce(AutoIsolationConfig.findAllActive)
        sinon.assert.notCalled(InputClusterConfig.findAllActive)
        done()
      })
    })

    it('should stop if InputClusterConfig.findAllActive failed', (done) => {
      InputClusterConfig.findAllActive.throws(new Error('Some error'))
      const instances = [ instance1, instance2 ]
      ClusterDataService.populateInstancesWithClusterInfo(instances, sessionUser)
        .asCallback((err, result) => {
          expect(err).to.not.exist()
          expect(result).to.equal(instances)
          sinon.assert.calledOnce(UserService.getBpOrgInfoFromGitHubId)
          sinon.assert.calledOnce(AutoIsolationConfig.findAllActive)
          sinon.assert.calledOnce(InputClusterConfig.findAllActive)
          done()
        })
    })

    it('should call all the chain with correct args', (done) => {
      const instances = [ instance1, instance2 ]
      ClusterDataService.populateInstancesWithClusterInfo(instances, sessionUser)
        .asCallback((err, result) => {
          expect(err).to.not.exist()
          expect(result).to.equal(instances)
          sinon.assert.calledOnce(UserService.getBpOrgInfoFromGitHubId)
          sinon.assert.calledWithExactly(UserService.getBpOrgInfoFromGitHubId, sessionUser, ownerGitHubId)
          sinon.assert.calledOnce(AutoIsolationConfig.findAllActive)
          sinon.assert.calledWithExactly(AutoIsolationConfig.findAllActive, {
            ownedByOrg: organization.id
          })
          sinon.assert.calledOnce(InputClusterConfig.findAllActive)
          sinon.assert.calledWithExactly(InputClusterConfig.findAllActive, {
            autoIsolationConfigId: { $in: [ objectId(aig1Id), objectId(aig2Id) ] }
          })
          done()
        })
    })

    it('should return correct result and modify input', (done) => {
      const instances = [ instance1, instance2]
      ClusterDataService.populateInstancesWithClusterInfo(instances, sessionUser)
        .asCallback((err, result) => {
          expect(err).to.not.exist()
          expect(result).to.equal(instances)
          expect(result.length).to.equal(2)
          expect(result[0]._doc.inputClusterConfig).to.exist()
          expect(result[0]._doc.inputClusterConfig._id.toString()).to.equal(clusterConfig1._id.toString())
          expect(result[1]._doc.inputClusterConfig).to.exist()
          expect(result[1]._doc.inputClusterConfig._id.toString()).to.equal(clusterConfig2._id.toString())
          expect(instances[0]._doc.inputClusterConfig).to.exist()
          expect(instances[0]._doc.inputClusterConfig._id.toString()).to.equal(clusterConfig1._id.toString())
          expect(instances[1]._doc.inputClusterConfig).to.exist()
          expect(instances[1]._doc.inputClusterConfig._id.toString()).to.equal(clusterConfig2._id.toString())
          done()
        })
    })
  })
})
