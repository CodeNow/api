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
})
