'use strict'
const Lab = require('lab')
const Code = require('code')

const Deployment = require('../../../../lib/models/mongo/deployment')
const mongooseControl = require('../../../../lib/models/mongo/mongoose-control')

const lab = exports.lab = Lab.script()
require('sinon-as-promised')

const after = lab.after
const afterEach = lab.afterEach
const before = lab.before
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it


describe('Deployment Model Integration Tests', function () {
  const data = {
    state: 'building'
  }

  before(mongooseControl.start)
  afterEach(function (done) {
    Deployment.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('setStateToDeploying', function () {
    let savedDeployment

    beforeEach(function (done) {
      return Deployment.createAsync(data)
        .tap(function (saved) {
          savedDeployment = saved
        })
    })

    it('should set state to building', function (done) {
      return Deployment.setStateToDeploying(savedDeployment._id)
        .then((deployment) => {
          expect(deployment._id).to.equal(savedDeployment._id)
          expect(deployment.state).to.equal('deploying')

          return Deployment.findByIdAsync(savedDeployment._id)
        })
        .then((currentDeployment) => {
          expect(currentDeployment._id).to.equal(savedDeployment._id)
          expect(currentDeployment.state).to.equal('deploying')
        })

    })
  }) // end setStateToDeploying
})
