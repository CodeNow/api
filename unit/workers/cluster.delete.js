/**
 * @module unit/workers/cluster.delete
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = require('code').expect
const it = lab.it

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const Worker = require('workers/cluster.delete')

describe('Cluster Delete Worker', function () {
  describe('worker', function () {
    const testData = {
      cluster: {
        id: 'some-id'
      }
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeClusterService, 'delete').resolves()
      done()
    })

    afterEach(function (done) {
      DockerComposeClusterService.delete.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any DockerComposeClusterService.delete error', function (done) {
        const mongoError = new Error('Mongo failed')
        DockerComposeClusterService.delete.rejects(mongoError)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
    })

    it('should return no error', function (done) {
      Worker.task(testData).asCallback(done)
    })

    it('should call service.delete function', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(DockerComposeClusterService.delete)
        sinon.assert.calledWithExactly(DockerComposeClusterService.delete, testData.cluster.id)
        done()
      })
    })
  })
})
