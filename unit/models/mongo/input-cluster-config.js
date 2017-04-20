'use strict'

const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const InputClusterConfig = require('models/mongo/input-cluster-config')
const sinon = require('sinon')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const describe = lab.describe
const expect = Code.expect
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const it = lab.it

describe('Input Cluster Config Model Tests', () => {
  describe('should have auditPlugin', () => {
    it('should have function markAsDeleted', (done) => {
      expect(InputClusterConfig.markAsDeleted).to.exist()
      done()
    })
    it('should have function findByIdAndAssert', (done) => {
      expect(InputClusterConfig.findByIdAndAssert).to.exist()
      done()
    })
    it('should have function findOneActive', (done) => {
      expect(InputClusterConfig.findOneActive).to.exist()
      done()
    })
    it('should have function findAllActive', (done) => {
      expect(InputClusterConfig.findAllActive).to.exist()
      done()
    })
    it('should have function assertFound', (done) => {
      expect(InputClusterConfig.assertFound).to.exist()
      done()
    })
  })

  describe('createOrUpdateConfig', () => {
    let autoIsolationConfig
    let iccModel
    let masterConfig
    let superMasterConfig
    let clusterOpts

    beforeEach(done => {
      clusterOpts = {
        filePath: 'dasdasd',
        fileSha: '123e12ed',
        createdByUser: 'dfasf3wavf',
        ownedByOrg: 'adsfsdfa',
        isTesting: false
      }
      autoIsolationConfig = {
        _id: 'asdasdasdasdasdasdasd'
      }
      masterConfig = {
        parentInputClusterConfigId: 'asdasdasdasdads',
        clusterName: 'faw3efaw3fwsf',
        _id: '34234ef'
      }
      superMasterConfig = {
        parentInputClusterConfigId: null,
        clusterName: 'erwerf3afdsad',
        _id: 'asdasdasd'
      }
      iccModel = new InputClusterConfig({})

      done()
    })

    beforeEach((done) => {
      sinon.stub(InputClusterConfig, 'findActiveByAutoIsolationId')
      sinon.stub(InputClusterConfig, 'createAsync')
      sinon.stub(iccModel, 'set').returns()
      sinon.stub(iccModel, 'saveAsync').resolves(iccModel)
      done()
    })

    afterEach((done) => {
      InputClusterConfig.findActiveByAutoIsolationId.restore()
      InputClusterConfig.createAsync.restore()
      iccModel.set.restore()
      iccModel.saveAsync.restore()
      done()
    })

    describe('updating', () => {
      beforeEach((done) => {
        InputClusterConfig.findActiveByAutoIsolationId.resolves(iccModel)
        done()
      })
      it('should resolve the found icc', () => {
        return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, masterConfig)
          .then(icc => {
            expect(icc).to.equal(iccModel)
          })
      })
      it('should fetch the ICC by the aicId', () => {
        return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, masterConfig)
          .then(() => {
            sinon.assert.calledOnce(InputClusterConfig.findActiveByAutoIsolationId)
            sinon.assert.calledWith(
              InputClusterConfig.findActiveByAutoIsolationId,
              autoIsolationConfig._id
            )
          })
      })
      it('should set the new props on the model, and save', () => {
        return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, masterConfig)
          .then(() => {
            sinon.assert.calledOnce(iccModel.set)
            sinon.assert.calledWith(
              iccModel.set,
              {
                autoIsolationConfigId: autoIsolationConfig._id,
                filePath: 'dasdasd',
                fileSha: '123e12ed',
                createdByUser: 'dfasf3wavf',
                ownedByOrg: 'adsfsdfa',
                isTesting: false
              }
            )
            sinon.assert.calledOnce(iccModel.saveAsync)
          })
      })
    })

    describe('creating a new one', () => {
      beforeEach((done) => {
        InputClusterConfig.findActiveByAutoIsolationId.rejects(new InputClusterConfig.NotFoundError('asdasd'))
        done()
      })
      it('should create a new one with properties from masterConfig', () => {
        return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, masterConfig)
          .then(() => {
            sinon.assert.calledOnce(InputClusterConfig.createAsync)
            sinon.assert.calledWith(
              InputClusterConfig.createAsync,
              {
                autoIsolationConfigId: autoIsolationConfig._id,
                parentInputClusterConfigId: masterConfig.parentInputClusterConfigId,
                clusterName: masterConfig.clusterName,
                filePath: 'dasdasd',
                fileSha: '123e12ed',
                createdByUser: 'dfasf3wavf',
                ownedByOrg: 'adsfsdfa',
                isTesting: false
              }
            )
          })
      })
      it('should create a new one with properties from superMasterConfig', () => {
        return InputClusterConfig.createOrUpdateConfig(autoIsolationConfig, clusterOpts, superMasterConfig)
          .then(() => {
            sinon.assert.calledOnce(InputClusterConfig.createAsync)
            sinon.assert.calledWith(
              InputClusterConfig.createAsync,
              {
                autoIsolationConfigId: autoIsolationConfig._id,
                parentInputClusterConfigId: superMasterConfig._id,
                clusterName: superMasterConfig.clusterName,
                filePath: 'dasdasd',
                fileSha: '123e12ed',
                createdByUser: 'dfasf3wavf',
                ownedByOrg: 'adsfsdfa',
                isTesting: false
              }
            )
          })
      })
    })
  })
})
