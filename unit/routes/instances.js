'use strict'
require('loadenv')()

const Promise = require('bluebird')
const Lab = require('lab')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const BuildService = require('models/services/build-service')
const InstanceForkService = require('models/services/instance-fork-service')
const instances = require('routes/instances')
const IsolationService = require('models/services/isolation-service')
const ClusterConfigService = require('models/services/cluster-config-service')

const lab = exports.lab = Lab.script()
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

describe('/instances', () => {
  describe('#forkInstance', () => {
    let mockReq
    let mockBuildAndCv
    let mockForkedInstance

    const githubId = '1234'
    beforeEach(done => {
      mockReq = {
        instance: {
          getRepoName: sinon.stub().returns('repoName')
        },
        body: {
          branch: 'branch12',
          sha: 'sha12'
        },
        sessionUser: {
          accounts: {
            github: {
              id: githubId
            }
          },
          bigPoppaUser: {
            id: 1
          }
        }
      }
      mockBuildAndCv = {
        build: {
          _id: 5678
        },
        user: {
          _id: 'USer ID'
        }
      }
      mockForkedInstance = {
        _id: 'mocked fork instance'
      }
      sinon.stub(BuildService, 'createAndBuildContextVersion').resolves(mockBuildAndCv)
      sinon.stub(InstanceForkService, 'forkMasterInstance').resolves(mockForkedInstance)
      sinon.stub(IsolationService, 'autoIsolate').resolves(mockForkedInstance)
      sinon.stub(ClusterConfigService, 'checkFileChangeAndCreateUpdateJob').resolves(mockForkedInstance)
      done()
    })

    afterEach(function (done) {
      BuildService.createAndBuildContextVersion.restore()
      InstanceForkService.forkMasterInstance.restore()
      IsolationService.autoIsolate.restore()
      ClusterConfigService.checkFileChangeAndCreateUpdateJob.restore()
      done()
    })
    it('should call createAndBuildContextVersion with the right parameters', done => {
      instances.forkInstance(mockReq)
        .then(function () {
          sinon.assert.calledOnce(BuildService.createAndBuildContextVersion)
          sinon.assert.calledWith(BuildService.createAndBuildContextVersion,
            mockReq.instance,
            {
              repo: 'repoName',
              branch: 'branch12',
              commit: 'sha12',
              user: {
                id: '1234'
              },
              bpUserId: mockReq.sessionUser.bigPoppaUser.id
            },
            'manual'
          )
        })
        .asCallback(done)
    })
    it('should call forkMasterInstance with the right params', function (done) {
      instances.forkInstance(mockReq)
        .then(function () {
          sinon.assert.calledOnce(InstanceForkService.forkMasterInstance)
          sinon.assert.calledWith(InstanceForkService.forkMasterInstance,
            mockReq.instance,
            '5678',
            'branch12',
            mockBuildAndCv.user
          )
        })
        .asCallback(done)
    })
    it('should call autoIsolate with the right params', function (done) {
      instances.forkInstance(mockReq)
        .then(function () {
          sinon.assert.calledOnce(IsolationService.autoIsolate)
          sinon.assert.calledWith(IsolationService.autoIsolate,
            [mockForkedInstance],
            {
              repo: 'repoName',
              branch: 'branch12',
              commit: 'sha12',
              user: {
                id: '1234'
              },
              bpUserId: mockReq.sessionUser.bigPoppaUser.id
            }
          )
        })
        .asCallback(done)
    })
    it('should call updateCluster with the right params', function (done) {
      instances.forkInstance(mockReq)
        .then(function () {
          sinon.assert.calledOnce(ClusterConfigService.checkFileChangeAndCreateUpdateJob)
          sinon.assert.calledWith(ClusterConfigService.checkFileChangeAndCreateUpdateJob,
            mockReq.sessionUser,
            mockForkedInstance,
            {
              repo: 'repoName',
              branch: 'branch12',
              commit: 'sha12',
              user: {
                id: '1234'
              },
              bpUserId: mockReq.sessionUser.bigPoppaUser.id
            }
          )
        })
        .asCallback(done)
    })
  })
})
