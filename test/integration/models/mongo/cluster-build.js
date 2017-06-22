'use strict'
const Lab = require('lab')
const Code = require('code')

const ClusterBuild = require('../../../../lib/models/mongo/cluster-build')
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


describe('ClusterBuild Model Integration Tests', function () {
  const data = {
    state: 'building'
  }

  before(mongooseControl.start)
  afterEach(function (done) {
    ClusterBuild.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('setStateToDeploying', function () {
    let savedClusterBuild

    beforeEach(function (done) {
      return ClusterBuild.createAsync(data)
        .tap(function (saved) {
          savedClusterBuild = saved
        })
    })

    it('should set state to building', function (done) {
      return ClusterBuild.setStateToDeploying(savedClusterBuild._id)
        .then((clusterBuild) => {
          expect(clusterBuild._id).to.equal(savedClusterBuild._id)
          expect(clusterBuild.state).to.equal('deploying')

          return ClusterBuild.findByIdAsync(savedClusterBuild._id)
        })
        .then((currentClusterBuild) => {
          expect(currentClusterBuild._id).to.equal(savedClusterBuild._id)
          expect(currentClusterBuild.state).to.equal('deploying')
        })

    })
  }) // end setStateToDeploying
})
