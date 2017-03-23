'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach
const sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))
const expect = require('code').expect

const exists = require('101/exists')
const keypather = require('keypather')()
const pick = require('101/pick')

const ClusterDataService = require('models/services/cluster-data-service')
const error = require('error')
const Instance = require('models/mongo/instance')
const joi = require('utils/joi')
const logger = require('logger')
const messenger = require('socket/messenger')
const mockSessionUser = { accounts: { github: { id: 4 } } }

const InstanceService = require('models/services/instance-service')

describe('Instances Services Model', function () {
  beforeEach((done) => {
    sinon.stub(Instance, 'aggregateAsync').resolves({})
    done()
  })

  afterEach((done) => {
    Instance.aggregateAsync.restore()
    done()
  })

  describe('#filter for instances by branch name', () => {
    it('should use the org and branchname to find documents', (done) => {
      const branchName = 'hello-henry-branch-name'
      const githubId = 999999
      InstanceService.findInstanceByBranchName(githubId, branchName, mockSessionUser)
        .asCallback((err) => {
          expect(err).to.not.exist()
          sinon.assert.calledWithExactly(Instance.aggregateAsync, [{ $match: { name: 'hello-henry-branch-name', 'owner.github': 999999 }}] )
          done()
      })
    })
    it('should use the branchname to find documents if no org', (done) => {
      const branchName = 'hello-henry-branch-name'
      InstanceService.findInstanceByBranchName(null, branchName, mockSessionUser)
        .asCallback((err) => {
          expect(err).to.not.exist()
          sinon.assert.calledWithExactly(Instance.aggregateAsync, [{ $match: { name: 'hello-henry-branch-name'}}] )
          done()
        })
    })
  })

  // describe('populateModels', function () {
  //   let ctx

  //   beforeEach(function (done) {
  //     ctx = {}
  //     done()
  //   })
  //   beforeEach(function (done) {
  //     sinon.stub(ClusterDataService, 'populateInstancesWithClusterInfo').resolves()
  //     done()
  //   })
  //   afterEach(function (done) {
  //     ClusterDataService.populateInstancesWithClusterInfo.restore()
  //     done()
  //   })
  //   beforeEach(function (done) {
  //     ctx.mockSessionUser = {
  //       _id: 1234,
  //       accounts: {
  //         github: {
  //           id: 1234
  //         }
  //       }
  //     }
  //     ctx.cvAttrs = {
  //       name: 'name1',
  //       owner: {
  //         github: '2335750'
  //       },
  //       createdBy: {
  //         github: '146592'
  //       },
  //       build: {
  //         _id: '23412312h3nk1lj2h3l1k2',
  //         completed: true
  //       }
  //     }
  //     ctx.mockContextVersion = mongoFactory.createNewVersion(ctx.cvAttrs)
  //     ctx.buildAttrs = {
  //       name: 'name1',
  //       owner: {
  //         github: '2335750'
  //       },
  //       createdBy: {
  //         github: '146592'
  //       }
  //     }
  //     ctx.mockBuild = new Build(ctx.buildAttrs)
  //     ctx.mockInstance = mongoFactory.createNewInstance('hello', {
  //       contextVersion: ctx.mockContextVersion,
  //       build: ctx.mockBuild._id
  //     })
  //     done()
  //   })
  //   beforeEach(function (done) {
  //     ctx.mockSessionUser.findGithubUserByGithubId = sinon.stub().yieldsAsync(null, {
  //       login: 'TEST-login',
  //       avatar_url: 'TEST-avatar_url'
  //     })
  //     done()
  //   })
  //   afterEach(function (done) {
  //     done()
  //   })

  //   describe('when instances are not all populated', function () {
  //     beforeEach(function (done) {
  //       sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
  //       sinon.stub(Build, 'findAsync').resolves([ctx.mockBuild])
  //       done()
  //     })
  //     afterEach(function (done) {
  //       ContextVersion.findAsync.restore()
  //       Build.findAsync.restore()
  //       done()
  //     })
  //     it('should fetch build and cv, then update the cv', function (done) {
  //       InstanceService.populateModels([ctx.mockInstance], ctx.mockSessionUser)
  //       .asCallback(function (err, instance) {
  //         expect(err).to.not.exist()
  //         sinon.assert.calledOnce(ContextVersion.findAsync)
  //         sinon.assert.calledOnce(Build.findAsync)
  //         done()
  //       })
  //     })
  //     it('should handle when 2 instances share a cv', function (done) {
  //       ctx.mockInstance2 = mongoFactory.createNewInstance('hello2', {
  //         contextVersion: ctx.mockContextVersion,
  //         build: ctx.mockBuild._id
  //       })

  //       InstanceService.populateModels([ctx.mockInstance, ctx.mockInstance2], ctx.mockSessionUser)
  //       .asCallback(function (err, instances) {
  //         expect(err).to.not.exist()
  //         sinon.assert.calledOnce(ContextVersion.findAsync)
  //         sinon.assert.calledOnce(Build.findAsync)
  //         expect(instances.length).to.equal(2)
  //         expect(instances[0].contextVersion.id, 'instance 1').to.equal(ctx.mockContextVersion.id)
  //         expect(instances[1].contextVersion.id, 'instance 2').to.equal(ctx.mockContextVersion.id)
  //         done()
  //       })
  //     })
  //   })

  //   describe('when errors happen', function () {
  //     var testErr = new Error('Test Error!')
  //     beforeEach(function (done) {
  //       sinon.stub(error, 'log')
  //       done()
  //     })
  //     afterEach(function (done) {
  //       error.log.restore()
  //       done()
  //     })

  //     describe('when an instance is missing its container Inspect', function () {
  //       beforeEach(function (done) {
  //         sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
  //         sinon.stub(Build, 'findAsync').resolves([ctx.mockBuild])
  //         done()
  //       })
  //       afterEach(function (done) {
  //         ContextVersion.findAsync.restore()
  //         Build.findAsync.restore()
  //         done()
  //       })
  //       it('should log the bad instance and keep going', function (done) {
  //         ctx.mockInstance2 = mongoFactory.createNewInstance('hello2', {
  //           contextVersion: ctx.mockContextVersion,
  //           build: ctx.mockBuild._id
  //         })
  //         ctx.mockInstance2.container = {
  //           dockerContainer: 'asdasdasdsad'
  //         }
  //         InstanceService.populateModels([ctx.mockInstance, ctx.mockInstance2], ctx.mockSessionUser)
  //         .asCallback(function (err, instances) {
  //           expect(err).to.not.exist()
  //           if (err) {
  //             done(err)
  //           }
  //           sinon.assert.calledOnce(ContextVersion.findAsync)
  //           sinon.assert.calledOnce(Build.findAsync)
  //           sinon.assert.calledOnce(error.log)
  //           sinon.assert.calledWith(
  //             error.log,
  //             sinon.match.has('message', 'instance missing inspect data' + ctx.mockInstance2._id)
  //           )
  //           done()
  //         })
  //       })
  //     })
  //     describe('when a failure happens during a db query', function () {
  //       beforeEach(function (done) {
  //         sinon.stub(Instance, 'findOneAndUpdateAsync').resolves(null)
  //         done()
  //       })
  //       afterEach(function (done) {
  //         Instance.findOneAndUpdateAsync.restore()
  //         done()
  //       })
  //       describe('CV.find', function () {
  //         beforeEach(function (done) {
  //           sinon.stub(Build, 'findAsync').resolves([ctx.mockBuild])
  //           sinon.stub(ContextVersion, 'find').yieldsAsync(testErr)
  //           done()
  //         })
  //         afterEach(function (done) {
  //           ContextVersion.find.restore()
  //           Build.findAsync.restore()
  //           done()
  //         })
  //         it('should return error', function (done) {
  //           InstanceService.populateModels([ctx.mockInstance], ctx.mockSessionUser)
  //           .asCallback(function (err) {
  //             expect(err).to.exist()
  //             setTimeout(function () {
  //               sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
  //               done()
  //             })
  //           })
  //         })
  //       })
  //       describe('Build.find', function () {
  //         beforeEach(function (done) {
  //           sinon.stub(Build, 'find').yieldsAsync(testErr)
  //           sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
  //           done()
  //         })
  //         afterEach(function (done) {
  //           ContextVersion.findAsync.restore()
  //           Build.find.restore()
  //           done()
  //         })
  //         it('should return error', function (done) {
  //           InstanceService.populateModels([ctx.mockInstance], ctx.mockSessionUser)
  //           .asCallback(function (err) {
  //             expect(err).to.exist()
  //             setTimeout(function () {
  //               sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
  //               done()
  //             })
  //           })
  //         })
  //       })
  //     })
  //   })
  // })
  
})
