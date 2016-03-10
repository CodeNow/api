'use strict'

var sinon = require('sinon')
var noop = require('101/noop')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect
var before = lab.before
var after = lab.after

var PullRequest = require('models/apis/pullrequest')
var GitHub = require('models/apis/github')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('PullRequest: ' + moduleName, function () {
  var ctx = {}
  before(function (done) {
    ctx.originalStatusFlag = process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES
    process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES = 'true'
    done()
  })
  after(function (done) {
    process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES = ctx.originalStatusFlag
    done()
  })
  describe('#_deploymentStatus', function () {
    describe('disabled statuses', function () {
      before(function (done) {
        ctx.originalStatusFlag = process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES
        process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES = 'false'
        done()
      })
      after(function (done) {
        process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES = ctx.originalStatusFlag
        done()
      })
      it('should do nothing if statuses are disabled', function (done) {
        var pullRequest = new PullRequest('anton-token')
        var gitInfo = {
          repo: 'codenow/hellonode'
        }
        var instance = {
          name: 'inst-1',
          owner: {
            username: 'codenow'
          }
        }
        pullRequest._deploymentStatus(gitInfo, 'some-id', 'error', 'descr',
          instance, function (error, resp) {
            expect(error).to.be.null()
            expect(resp).to.be.undefined()
            done()
          })
      })
    })
    it('should fail if deploymentId is null', function (done) {
      var pullRequest = new PullRequest('anton-token')
      var gitInfo = {
        repo: 'codenow/hellonode'
      }
      var instance = {
        name: 'inst-1',
        owner: {
          username: 'codenow'
        }
      }
      pullRequest._deploymentStatus(gitInfo, null, 'error', 'descr',
        instance, function (error) {
          expect(error.output.statusCode).to.equal(404)
          expect(error.output.payload.message)
            .to.equal('Deployment id is not found')
          done()
        })
    })
  })

  describe('#deploymentSucceeded', function () {
    it('should call github method with correct payload', function (done) {
      var pullRequest = new PullRequest('anton-token')
      var gitInfo = {
        repo: 'codenow/hellonode'
      }
      var instance = {
        name: 'inst-1',
        owner: {
          username: 'codenow'
        }
      }
      sinon.stub(PullRequest.prototype, 'createDeployment', function (gitInfo, instance, cb) {
        cb(null, { id: 'deployment-id' })
      })
      sinon.stub(GitHub.prototype, 'createDeploymentStatus', function (repo, payload) {
        expect(repo).to.equal(gitInfo.repo)
        expect(payload.id).to.equal('deployment-id')
        expect(payload.state).to.equal('success')
        expect(payload.target_url).to.equal(process.env.WEB_URL + '/codenow/inst-1')
        expect(payload.description).to.equal('Deployed to inst-1 on Runnable.')
        GitHub.prototype.createDeploymentStatus.restore()
        PullRequest.prototype.createDeployment.restore()
        done()
      })
      pullRequest.deploymentSucceeded(gitInfo, instance)
    })
  })

  describe('#createDeployment', function () {
    var ctx = {}
    before(function (done) {
      ctx.originalFlag = process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES
      process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES = 'true'
      done()
    })
    after(function (done) {
      process.env.ENABLE_GITHUB_DEPLOYMENT_STATUSES = ctx.originalFlag
      done()
    })
    it('should call github method with correct payload', function (done) {
      var pullRequest = new PullRequest('anton-token')
      var gitInfo = {
        repo: 'codenow/hellonode',
        commit: 'somecommitsha'
      }
      sinon.stub(GitHub.prototype, 'createDeployment', function (repo, payload) {
        expect(repo).to.equal(gitInfo.repo)
        expect(payload.auto_merge).to.equal(false)
        expect(payload.environment).to.equal('runnable')
        expect(payload.required_contexts.length).to.equal(0)
        expect(payload.payload).to.equal(JSON.stringify({}))
        expect(payload.ref).to.equal(gitInfo.commit)
        expect(payload.description).to.equal('Deploying to inst-1 on Runnable.')
        GitHub.prototype.createDeployment.restore()
        done()
      })
      pullRequest.createDeployment(gitInfo, 'inst-1', noop)
    })
  })
})
