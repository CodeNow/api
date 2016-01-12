'use strict'

require('loadenv')()
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var Boom = require('dat-middleware').Boom
var DeleteInstanceContainer = require('workers/delete-instance-container')
var Docker = require('models/apis/docker')
var Hosts = require('models/redis/hosts')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: delete-instance-container: ' + moduleName, function () {
  describe('#handle', function () {
    it('should fail if container was not specified', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706
      })
      sinon.spy(worker, '_handleError')
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        expect(worker._handleError.callCount).to.equal(1)
        var err = worker._handleError.args[0][0]
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Container was not specified')
        done()
      })
    })
    it('should fail if dockerContainer was not specified', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        container: {
          dockerHost: 'https://localhost:4242'
        }
      })
      sinon.spy(worker, '_handleError')
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        expect(worker._handleError.callCount).to.equal(1)
        var err = worker._handleError.args[0][0]
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Container was not specified')
        done()
      })
    })

    it('should fail job if hosts call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        ownerGithubUsername: 'podviaznikov',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      })
      sinon.spy(worker, '_handleError')
      sinon.stub(Hosts.prototype, 'removeHostsForInstance')
        .yieldsAsync(Boom.badRequest('Hosts error'))
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        var err = worker._handleError.args[0][0]
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Hosts error')
        Hosts.prototype.removeHostsForInstance.restore()
        done()
      })
    })
    it('should fail job if docker.stopContainer call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        ownerGithubUsername: 'podviaznikov',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      })
      sinon.spy(worker, '_handleError')
      sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'stopContainer')
        .yieldsAsync(Boom.badRequest('Docker stopContainer error'))
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        var err = worker._handleError.args[0][0]
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Docker stopContainer error')
        expect(Docker.prototype.stopContainer.callCount).to.equal(5)
        Hosts.prototype.removeHostsForInstance.restore()
        Docker.prototype.stopContainer.restore()
        done()
      })
    })
    it('should fail job if docker.removeContainer call failed', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        ownerGithubUsername: 'podviaznikov',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      })
      sinon.spy(worker, '_handleError')
      sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'stopContainer').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'removeContainer')
        .yieldsAsync(Boom.badRequest('Docker removeContainer error'))
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        var err = worker._handleError.args[0][0]
        expect(err.output.statusCode).to.equal(400)
        expect(err.output.payload.message).to.equal('Docker removeContainer error')
        expect(Docker.prototype.removeContainer.callCount).to.equal(5)
        Hosts.prototype.removeHostsForInstance.restore()
        Docker.prototype.stopContainer.restore()
        Docker.prototype.removeContainer.restore()
        done()
      })
    })
    it('should not fail job if docker.removeContainer returned 404', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        ownerGithubUsername: 'podviaznikov',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      })
      sinon.spy(worker, '_handleError')
      sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'stopContainer').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'removeContainer')
        .yieldsAsync(Boom.notFound('Container was not found'))
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        expect(worker._handleError.callCount).to.equal(0)
        expect(Docker.prototype.stopContainer.callCount).to.equal(1)
        expect(Docker.prototype.removeContainer.callCount).to.equal(1)
        Hosts.prototype.removeHostsForInstance.restore()
        Docker.prototype.stopContainer.restore()
        Docker.prototype.removeContainer.restore()
        done()
      })
    })
    it('should report success if no errors occured', function (done) {
      var worker = new DeleteInstanceContainer({
        instanceName: 'api',
        instanceMasterPod: true,
        instanceMasterBranch: 'master',
        ownerGithubId: 429706,
        ownerGithubUsername: 'podviaznikov',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      })
      sinon.stub(Hosts.prototype, 'removeHostsForInstance').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'stopContainer').yieldsAsync(null)
      sinon.stub(Docker.prototype, 'removeContainer').yieldsAsync(null)
      worker.handle(function (jobErr) {
        expect(jobErr).to.not.exist()
        expect(Hosts.prototype.removeHostsForInstance.callCount).to.equal(1)
        expect(Docker.prototype.stopContainer.callCount).to.equal(1)
        expect(Docker.prototype.stopContainer.getCall(0).args[0])
          .to.equal(worker.data.container.dockerContainer)
        expect(Docker.prototype.removeContainer.callCount).to.equal(1)
        expect(Docker.prototype.removeContainer.getCall(0).args[0])
          .to.equal(worker.data.container.dockerContainer)

        Hosts.prototype.removeHostsForInstance.restore()
        Docker.prototype.stopContainer.restore()
        Docker.prototype.removeContainer.restore()
        done()
      })
    })
  })
})
