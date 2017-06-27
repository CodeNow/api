'use strict'
const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')

const ClusterBuild = require('../../../lib/models/mongo/cluster-build')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('ClusterBuild model unit test', () => {
  let testClusterBuild
  let testClusterBuildModel
  const testClusterBuildId = '123123123'

  beforeEach((done) => {
    testClusterBuild = {
      _id: testClusterBuildId,
      state: 'building'
    }
    testClusterBuildModel = {
      toJSON: () => {
        return testClusterBuild
      }
    }
    done()
  })

  describe('setStateToDeploying', () => {
    beforeEach((done) => {
      sinon.stub(ClusterBuild, 'findOneAndUpdateAsync')
      sinon.stub(ClusterBuild, 'findByIdAsync')
      done()
    })

    afterEach((done) => {
      ClusterBuild.findOneAndUpdateAsync.restore()
      ClusterBuild.findByIdAsync.restore()
      done()
    })

    it('should return clusterBuild', () => {
      const testSpec = {
        Image: 'busybox',
        Ports: [90, 80]
      }
      ClusterBuild.findOneAndUpdateAsync.resolves(testClusterBuildModel)

      return ClusterBuild.setStateToDeploying({
        _id: testClusterBuildId,
        specifications: testSpec
      })
      .then((clusterBuild) => {
        expect(clusterBuild).to.equal(testClusterBuild)
        sinon.assert.calledOnce(ClusterBuild.findOneAndUpdateAsync)
        sinon.assert.calledWith(ClusterBuild.findOneAndUpdateAsync, {
          _id: testClusterBuildId,
          state: 'built'
        }, {
          $set: {
            state: 'deploying',
            specifications: testSpec
          }
        })
      })
    })

    it('should throw ClusterBuild.NotFoundError', () => {
      ClusterBuild.findOneAndUpdateAsync.resolves()
      ClusterBuild.findByIdAsync.resolves()

      return ClusterBuild.setStateToDeploying({
        _id: testClusterBuildId
      })
      .catch(ClusterBuild.NotFoundError, () => {
        sinon.assert.calledOnce(ClusterBuild.findByIdAsync)
        sinon.assert.calledWith(ClusterBuild.findByIdAsync, testClusterBuildId)
      })
    })

    it('should throw ClusterBuild.IncorrectStateError', () => {
      ClusterBuild.findOneAndUpdateAsync.resolves()
      ClusterBuild.findByIdAsync.resolves({
        state: 'error'
      })

      return ClusterBuild.setStateToDeploying({
        _id: testClusterBuildId
      })
      .catch(ClusterBuild.IncorrectStateError, () => {
        sinon.assert.calledOnce(ClusterBuild.findByIdAsync)
        sinon.assert.calledWith(ClusterBuild.findByIdAsync, testClusterBuildId)
      })
    })
  }) // end setStateToDeploying
})
