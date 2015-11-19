/**
 * @module unit/workers/on-instance-container-die
 */
'use strict'

var Lab = require('lab')
var Code = require('code')
var Hashids = require('hashids')
var sinon = require('sinon')

var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var OnInstanceContainerDie = require('workers/on-instance-container-die')

var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

var validation = require('../fixtures/validation')(lab)

var id = 0
function getNextId () {
  id++
  return id
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH)
  return hashids.encrypt(getNextId())
}
function createNewVersion (opts) {
  return new ContextVersion({
    message: 'test',
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    config: validation.VALID_OBJECT_ID,
    created: Date.now(),
    context: validation.VALID_OBJECT_ID,
    files: [{
      Key: 'test',
      ETag: 'test',
      VersionId: validation.VALID_OBJECT_ID
    }],
    build: {
      dockerImage: 'testing',
      dockerTag: 'adsgasdfgasdf'
    },
    appCodeVersions: [
      {
        additionalRepo: false,
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        defaultBranch: opts.defaultBranch || 'master',
        commit: 'deadbeef'
      },
      {
        additionalRepo: true,
        commit: '4dd22d12b4b3b846c2e2bbe454b89cb5be68f71d',
        branch: 'master',
        lowerBranch: 'master',
        repo: 'Nathan219/yash-node',
        lowerRepo: 'nathan219/yash-node',
        _id: '5575f6c43074151a000e8e27',
        privateKey: 'Nathan219/yash-node.key',
        publicKey: 'Nathan219/yash-node.key.pub',
        defaultBranch: 'master',
        transformRules: { rename: [], replace: [], exclude: [] }
      }
    ]
  })
}

function createNewInstance (name, opts) {
  opts = opts || {}
  var container = {
    dockerContainer: opts.containerId || validation.VALID_OBJECT_ID
  }
  return new Instance({
    name: name || 'name',
    shortHash: getNextHash(),
    locked: opts.locked || false,
    'public': false,
    masterPod: opts.masterPod || false,
    parent: opts.parent,
    autoForked: opts.autoForked || false,
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    build: validation.VALID_OBJECT_ID,
    created: Date.now(),
    contextVersion: createNewVersion(opts),
    container: container,
    containers: [],
    network: {
      hostIp: '1.1.1.100'
    }
  })
}

describe('OnInstanceContainerDie: ' + moduleName, function () {
  var ctx
  describe('handle', function () {
    beforeEach(function (done) {
      ctx = {}
      ctx.worker = OnInstanceContainerDie.worker
      ctx.job = {
        id: 111,
        host: '10.0.0.1',
        inspectData: {
          NetworkSettings: {
            Ports: []
          },
          Config: {
            Labels: {
              instanceId: 111,
              ownerUsername: 'fifo',
              sessionUserGithubId: 444,
              contextVersionId: 123
            }
          }
        }
      }
      ctx.mockInstance = createNewInstance()
      ctx.mockUser = {}
      sinon.stub(Instance, 'findOneByContainerId')
      sinon.stub(Instance.prototype, 'modifyContainerInspect')
      sinon.stub(User, 'findByGithubId')
      sinon.stub(Instance.prototype, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      Instance.findOneByContainerId.restore()
      Instance.prototype.modifyContainerInspect.restore()
      User.findByGithubId.restore()
      Instance.prototype.emitInstanceUpdate.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        Instance.findOneByContainerId.yieldsAsync(null, ctx.mockInstance)
        Instance.prototype.modifyContainerInspect.yieldsAsync(null, ctx.mockInstance)
        User.findByGithubId.yieldsAsync(null, ctx.mockUser)
        Instance.prototype.emitInstanceUpdate.yieldsAsync(null, ctx.mockInstance)
        done()
      })

      it('should handle instance container die successfully', function (done) {
        ctx.worker(ctx.job, function (err) {
          sinon.assert.calledWith(
            Instance.findOneByContainerId,
            ctx.job.id,
            sinon.match.func
          )
          sinon.assert.calledWith(
            Instance.prototype.modifyContainerInspect,
            ctx.job.id,
            ctx.job.inspectData,
            sinon.match.func
          )
          sinon.assert.calledWith(User.findByGithubId, ctx.mockInstance.createdBy.github, sinon.match.func)
          sinon.assert.calledWith(ctx.mockInstance.emitInstanceUpdate, ctx.mockUser, 'container_inspect', sinon.match.func)
          expect(err).to.not.exist()
          done()
        })
      })
    })

    describe('errors', function () {
      describe('Instance.findOneByContainerId err', function () {
        beforeEach(function (done) {
          ctx.err = new Error()
          Instance.findOneByContainerId.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the err', function (done) {
          ctx.worker(ctx.job, expectErr(ctx.err, done))
        })
      })
      describe('Instance.prototype.modifyContainerInspect err', function () {
        beforeEach(function (done) {
          ctx.err = new Error()
          Instance.findOneByContainerId.yieldsAsync(null, ctx.mockInstance)
          Instance.prototype.modifyContainerInspect.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the err', function (done) {
          ctx.worker(ctx.job, expectErr(ctx.err, done))
        })
      })
      describe('User.findByGithubId err', function () {
        beforeEach(function (done) {
          ctx.err = new Error()
          Instance.findOneByContainerId.yieldsAsync(null, ctx.mockInstance)
          Instance.prototype.modifyContainerInspect.yieldsAsync(null, ctx.mockInstance)
          User.findByGithubId.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the err', function (done) {
          ctx.worker(ctx.job, expectErr(ctx.err, done))
        })
      })
      describe('Instance.prototype.emitInstanceUpdate err', function () {
        beforeEach(function (done) {
          ctx.err = new Error()
          Instance.findOneByContainerId.yieldsAsync(null, ctx.mockInstance)
          Instance.prototype.modifyContainerInspect.yieldsAsync(null, ctx.mockInstance)
          User.findByGithubId.yieldsAsync(null, ctx.mockUser)
          Instance.prototype.emitInstanceUpdate.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the err', function (done) {
          ctx.worker(ctx.job, expectErr(ctx.err, done))
        })
      })

      function expectErr (expectedErr, done) {
        return function (err) {
          try {
            expect(err).to.exist()
            expect(err).to.equal(expectedErr)
            done()
          } catch (e) {
            done(e)
          }
        }
      }
    })
  })
})
