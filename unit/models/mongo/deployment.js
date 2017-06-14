'use strict'
const Code = require('code')
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')

const Deployment = require('../../../lib/models/mongo/deployment')

require('sinon-as-promised')(Promise)
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('Deployment model unit test', () => {
  let testDeployment
  const testDeploymentId = '123123123'

  beforeEach((done) => {
    testDeployment = {
      _id: testDeploymentId,
      state: 'building'
    }
    done()
  })

  describe('setStateToDeploying', () => {
    beforeEach((done) => {
      sinon.stub(Deployment, 'findOneAndUpdateAsync')
      sinon.stub(Deployment, 'findByIdAsync')
      done()
    })

    afterEach((done) => {
      Deployment.findOneAndUpdateAsync.restore()
      Deployment.findByIdAsync.restore()
      done()
    })

    it('should return deployment', () => {
      Deployment.findOneAndUpdateAsync.resolves(testDeployment)

      return Deployment.setStateToDeploying(testDeploymentId)
        .then((deployment) => {
          expect(deployment).to.equal(testDeployment)
          sinon.assert.calledOnce(Deployment.findOneAndUpdateAsync)
          sinon.assert.calledWith(Deployment.findOneAndUpdateAsync, {
            _id: testDeploymentId,
            state: 'building'
          }, {
            $set: {
              state: 'deploying'
            }
          })
      })
    })

    it('should throw Deployment.NotFoundError', () => {
      Deployment.findOneAndUpdateAsync.resolves()
      Deployment.findByIdAsync.resolves()

      return Deployment.setStateToDeploying(testDeploymentId)
        .catch(Deployment.NotFoundError, () => {
          sinon.assert.calledOnce(Deployment.findByIdAsync)
          sinon.assert.calledWith(Deployment.findByIdAsync, testDeploymentId)
        })
    })

    it('should throw Deployment.IncorrectStateError', () => {
      Deployment.findOneAndUpdateAsync.resolves()
      Deployment.findByIdAsync.resolves({
        state: 'error'
      })

      return Deployment.setStateToDeploying(testDeploymentId)
        .catch(Deployment.IncorrectStateError, () => {
          sinon.assert.calledOnce(Deployment.findByIdAsync)
          sinon.assert.calledWith(Deployment.findByIdAsync, testDeploymentId)
        })
    })
  }) // end setStateToDeploying
})
