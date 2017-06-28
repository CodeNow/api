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


describe('ClusterBuild Model Integration Tests', () => {
  before(mongooseControl.start)

  afterEach((done) => {
    ClusterBuild.remove({}, done)
  })

  after(mongooseControl.stop)

  describe('setStateToDeploying', () => {
    let savedClusterBuild

    beforeEach((done) => {
      return ClusterBuild.createAsync({
          state: 'built'
        })
        .tap((saved) => {
          savedClusterBuild = saved
        })
    })

    it('should set state to deploying', (done) => {
      return ClusterBuild.setStateToDeploying(savedClusterBuild)
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

  describe('setStateToBuilt', () => {
    let savedClusterBuild

    beforeEach((done) => {
      return ClusterBuild.createAsync({
          state: 'building'
        })
        .tap((saved) => {
          savedClusterBuild = saved
        })
    })

    it('should set state to built', (done) => {
      return ClusterBuild.setStateToBuilt(savedClusterBuild._id)
        .then((clusterBuild) => {
          expect(clusterBuild._id).to.equal(savedClusterBuild._id)
          expect(clusterBuild.state).to.equal('built')

          return ClusterBuild.findByIdAsync(savedClusterBuild._id)
        })
        .then((currentClusterBuild) => {
          expect(currentClusterBuild._id).to.equal(savedClusterBuild._id)
          expect(currentClusterBuild.state).to.equal('built')
        })
    })
  }) // end setStateToBuilt

  describe('setStateToError', () => {
    let savedClusterBuild

    beforeEach((done) => {
      return ClusterBuild.createAsync({
          state: 'building'
        })
        .tap((saved) => {
          savedClusterBuild = saved
        })
    })

    it('should set state to built', (done) => {
      const testErr = new Error('Broken')

      return ClusterBuild.setStateToError(savedClusterBuild._id, testErr)
        .then((clusterBuild) => {
          expect(clusterBuild._id).to.equal(savedClusterBuild._id)
          expect(clusterBuild.state).to.equal('errored')
          expect(clusterBuild.errorMessage).to.equal(testErr.message)

          return ClusterBuild.findByIdAsync(savedClusterBuild._id)
        })
        .then((currentClusterBuild) => {
          expect(currentClusterBuild._id).to.equal(savedClusterBuild._id)
          expect(currentClusterBuild.state).to.equal('errored')
          expect(currentClusterBuild.errorMessage).to.equal(testErr.message)
        })
    })
  }) // end setStateToError
})
