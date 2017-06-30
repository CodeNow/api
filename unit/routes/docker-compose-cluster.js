/**
 * @module unit/routes/docker-compose-cluster
 */
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const Lab = require('lab')
const sinon = require('sinon')
const Code = require('code')
require('sinon-as-promised')(Promise)

const clusterCreateId = 'LGM!'
sinon.stub( require.cache[ require.resolve( 'uuid' ) ], 'exports', () => {
  return clusterCreateId;
});

const joi = require('utils/joi')
const rabbitMQ = require('models/rabbitmq')
const postRoute = require('routes/docker-compose-cluster').postRoute
const deleteRoute = require('routes/docker-compose-cluster').deleteRoute
const redeployRoute = require('routes/docker-compose-cluster').redeployRoute
const multiClusterCreate = require('routes/docker-compose-cluster').multiClusterCreate
const multiCreateRoute = require('routes/docker-compose-cluster').multiCreateRoute
const Instance = require('models/mongo/instance')
const ClusterConfigService = require('models/services/cluster-config-service')

const lab = exports.lab = Lab.script()
const describe = lab.describe
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const expect = Code.expect
const it = lab.it

describe('/docker-compose-cluster', function () {
  let resMock
  let validateOrBoomStub
  let nextStub
  let isTesting = false
  let testReporters = []
  const sessionUserGithubId = 1981198
  const sessionUserBigPoppaId = 8084808
  const parentInputClusterConfigId = 'funk flex'
  const githubId = sessionUserGithubId
  const shouldNotAutoFork = true
  const mockSessionUser ={
    accounts: {
      github: { id: sessionUserGithubId }
    },
    _bigPoppaUser: { id: sessionUserBigPoppaId }
  }
  beforeEach(function (done) {
    nextStub = sinon.stub()
    resMock = {
      status: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    }
    done()
  })

  describe('post', function () {
    let createClusterStub
    let reqMock
    const repo = 'octobear'
    const branch = 'master'
    const filePath = '/docker-compose.yml'
    const name = 'super-cool-name'
    beforeEach(function (done) {
      createClusterStub = sinon.stub(rabbitMQ, 'createCluster')
      validateOrBoomStub = sinon.spy(joi, 'validateOrBoomAsync')
      reqMock = {
        body: { repo, branch, filePath, name, parentInputClusterConfigId, githubId, shouldNotAutoFork },
        sessionUser: {
          accounts: {
            github: { id: sessionUserGithubId }
          },
          _bigPoppaUser: { id: sessionUserBigPoppaId }
        }
      }
      done()
    })
    afterEach(function (done) {
      createClusterStub.restore()
      validateOrBoomStub.restore()
      done()
    })

    describe('Errors', function () {
      it('should throw a Boom error if the schema is not correct', function (done) {
        postRoute({ body: {} }, resMock, nextStub)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.equal(true)
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/is.*required/i)
            done()
          })
      })
    })

    describe('Success', function () {
      it('should validate the body', function (done) {
        postRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(validateOrBoomStub)
          })
          .asCallback(done)
      })

      it('should enqueue a job', function (done) {
        postRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(createClusterStub)
            sinon.assert.calledWith(createClusterStub, {
              mainInstanceServiceName: undefined,
              sessionUserBigPoppaId,
              triggeredAction: 'user',
              repoFullName: repo,
              branchName: branch,
              filePath,
              githubId,
              isTesting,
              parentInputClusterConfigId,
              testReporters,
              shouldNotAutoFork,
              clusterCreateId,
              clusterName: name
            })
          })
          .asCallback(done)
      })

      it('should call the response handler with a 202', function (done) {
        postRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(resMock.status)
            sinon.assert.calledWith(resMock.status, 202)
            sinon.assert.calledOnce(resMock.json)
            sinon.assert.calledWith(resMock.json, { message: sinon.match.string })
            done()
          })
      })
    })
  })


  describe('Multi', function () {
    let createClusterStub
    let reqMock
    const repo = 'octobear'
    const branch = 'master'
    const filePath = '/docker-compose.yml'
    const name = 'super-cool-name'
    const shouldNotAutoFork = true
    const mains = {
      builds: {
        hello: {},
        cya: {}
      },
      externals: {
        cheese: {},
        rain: {}
      }
    }
    const uniqueMains = {
      builds: ['hello'],
      externals: ['cheese', 'rain']
    }
    const body = { repo, branch, filePath, name, parentInputClusterConfigId, githubId, shouldNotAutoFork }
    beforeEach(function (done) {
      createClusterStub = sinon.stub(rabbitMQ, 'createCluster')
      validateOrBoomStub = sinon.spy(joi, 'validateOrBoomAsync')
      sinon.stub(ClusterConfigService, 'getUniqueServicesKeysFromOctobearResults').returns(uniqueMains)
      sinon.stub(ClusterConfigService, '_parseComposeInfoForConfig').resolves({ mains })
      done()
    })
    afterEach(function (done) {
      createClusterStub.restore()
      validateOrBoomStub.restore()
      ClusterConfigService._parseComposeInfoForConfig.restore()
      ClusterConfigService.getUniqueServicesKeysFromOctobearResults.restore()
      done()
    })

    describe('Errors', function () {
      it('should throw a Boom error if the schema is not correct', function (done) {
        multiClusterCreate(mockSessionUser, {})
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.equal(true)
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/is.*required/i)
            done()
          })
      })
    })

    describe('Success', function () {
      it('should validate the body', function () {
        return multiClusterCreate(mockSessionUser, body)
          .then(function () {
            sinon.assert.calledOnce(validateOrBoomStub)
          })
      })

      it('should enqueue a job for each unique cluster', function () {
        return multiClusterCreate(mockSessionUser, body)
          .then(function () {
            sinon.assert.callCount(createClusterStub, 3) // not 4, because of unique
            sinon.assert.calledWith(createClusterStub, {
              mainInstanceServiceName: 'hello',
              sessionUserBigPoppaId,
              triggeredAction: 'user',
              repoFullName: repo,
              branchName: branch,
              filePath,
              githubId,
              isTesting,
              clusterCreateId,
              parentInputClusterConfigId,
              shouldNotAutoFork,
              testReporters,
              clusterName: sinon.match.string
            })
          })
      })

      it('should call the response handler with a 202', function () {
        reqMock = {
          body: { repo, branch, filePath, name, parentInputClusterConfigId, githubId },
          sessionUser: {
            accounts: {
              github: { id: sessionUserGithubId }
            },
            _bigPoppaUser: { id: sessionUserBigPoppaId }
          }
        }
        return multiCreateRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(resMock.status)
            sinon.assert.calledWith(resMock.status, 202)
            sinon.assert.calledOnce(resMock.json)
            sinon.assert.calledWith(resMock.json, {
              message: sinon.match.string,
              created: sinon.match({
                builds: sinon.match.array,
                externals: sinon.match.array
              })
            })
          })
      })
    })
  })

  describe('delete', function () {
    let deleteClusterStub
    let reqMock
    const clusterId = '584051538b7b54bb6511aeb6'
    beforeEach(function (done) {
      deleteClusterStub = sinon.stub(rabbitMQ, 'deleteCluster')
      validateOrBoomStub = sinon.spy(joi, 'validateOrBoomAsync')
      reqMock = {
        body: { cluster: { id: clusterId } },
        sessionUser: {
          accounts: { github: { id: sessionUserGithubId } }
        }
      }
      done()
    })
    afterEach(function (done) {
      deleteClusterStub.restore()
      validateOrBoomStub.restore()
      done()
    })
    describe('Errors', function () {
      it('should throw a Boom error if the schema is not correct', function (done) {
        deleteRoute({ body: {} }, resMock, nextStub)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.equal(true)
            expect(err.output.statusCode).to.equal(400)
            expect(err.message).to.match(/is.*required/i)
            done()
          })
      })
    })

    describe('Success', function () {
      it('should validate the body', function (done) {
        deleteRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(validateOrBoomStub)
          })
          .asCallback(done)
      })

      it('should enqueue a job', function (done) {
        deleteRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(deleteClusterStub)
            sinon.assert.calledWith(deleteClusterStub, {
              cluster: { id: clusterId }
            })
          })
          .asCallback(done)
      })

      it('should return a 202', function (done) {
        deleteRoute(reqMock, resMock, nextStub)
          .then(function () {
            sinon.assert.calledOnce(resMock.status)
            sinon.assert.calledWith(resMock.status, 202)
            sinon.assert.calledOnce(resMock.json)
            sinon.assert.calledWith(resMock.json, { message: sinon.match.string })
            done()
          })
      })
    })
  })

  describe('redeploy', () => {
    let reqMock
    let findInstanceStub
    let killIsolationJobStub
    beforeEach((done) => {
      reqMock = {
        body: {
          instanceId: 'aaaa',
        }
      }
      findInstanceStub = sinon.stub(Instance, 'findOneAsync').resolves({isolated: 'bbbb'})
      killIsolationJobStub = sinon.stub(rabbitMQ, 'killIsolation').resolves({})
      done()
    })
    afterEach((done) => {
      findInstanceStub.restore()
      killIsolationJobStub.restore()
      done()
    })

    it('should call kill isolation with the isolation id', (done) => {
      redeployRoute(reqMock, resMock, nextStub)
        .then(() => {
          sinon.assert.calledOnce(findInstanceStub)
          sinon.assert.calledWith(findInstanceStub, { _id: 'aaaa' })
          sinon.assert.calledOnce(killIsolationJobStub)
          sinon.assert.calledWith(killIsolationJobStub, { isolationId: 'bbbb', triggerRedeploy: true })
        })
        .asCallback(done)
    })
  })
})
