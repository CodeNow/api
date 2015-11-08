/**
 * @module unit/workers/on-instance-container-start
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')

var Hosts = require('models/redis/hosts')
var OnInstanceContainerStartWorker = require('workers/on-instance-container-start')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnInstanceContainerStartWorker: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.mockInstance = {
      '_id': 'adsfasdfasdfqwfqw cvasdvasDFV',
      name: 'name1',
      owner: {
        github: '',
        username: 'foo',
        gravatar: ''
      },
      createdBy: {
        github: '',
        username: '',
        gravatar: ''
      },
      network: {
        hostIp: '0.0.0.0'
      },
      modifyContainerInspect: function () {}
    }
    ctx.labels = {
      instanceId: ctx.mockInstance._id,
      ownerUsername: 'fifo',
      sessionUserGithubId: 444,
      contextVersionId: 123
    }
    ctx.data = {
      id: 111,
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: []
        },
        Config: {
          Labels: ctx.labels
        }
      }
    }
    ctx.worker = new OnInstanceContainerStartWorker(ctx.data)
    done()
  })
  beforeEach(function (done) {
    sinon.stub(ctx.worker, '_baseWorkerFindInstance', function (query, cb) {
      ctx.worker.instance = ctx.mockInstance
      cb(null, ctx.mockInstance)
    })
    sinon.stub(ctx.worker, '_baseWorkerUpdateInstanceFrontend').yieldsAsync(null)
    done()
  })
  afterEach(function (done) {
    ctx.worker._baseWorkerFindInstance.restore()
    ctx.worker._baseWorkerUpdateInstanceFrontend.restore()
    done()
  })
  describe('all together', function () {
    beforeEach(function (done) {
      sinon.stub(Hosts.prototype, 'upsertHostsForInstance').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Hosts.prototype.upsertHostsForInstance.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(null, ctx.mockInstance)
        done()
      })
      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore()
        done()
      })

      it('should do everything', function (done) {
        ctx.worker.handle(function (err) {
          expect(err).to.be.null()
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1)
          expect(ctx.mockInstance.modifyContainerInspect.args[0][0])
            .to.equal(ctx.data.id)
          expect(ctx.mockInstance.modifyContainerInspect.args[0][1])
            .to.equal(ctx.data.inspectData)
          expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1)
          expect(Hosts.prototype.upsertHostsForInstance.args[0][0])
            .to.equal(ctx.labels.ownerUsername)
          expect(Hosts.prototype.upsertHostsForInstance.args[0][1]).to.equal(ctx.mockInstance)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
          done()
        })
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(new Error('this is an error'))
        done()
      })

      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore()
        done()
      })

      it('should get most of the way through, then fail', function (done) {
        ctx.worker.handle(function (err) {
          // This should never return an error
          expect(err).to.be.null()
          expect(ctx.worker._baseWorkerFindInstance.callCount).to.equal(1)
          expect(Hosts.prototype.upsertHostsForInstance.callCount).to.equal(1)
          expect(Hosts.prototype.upsertHostsForInstance.args[0][0])
            .to.equal(ctx.labels.ownerUsername)
          expect(Hosts.prototype.upsertHostsForInstance.args[0][1]).to.equal(ctx.mockInstance)
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1)
          expect(ctx.worker._baseWorkerUpdateInstanceFrontend.callCount).to.equal(1)
          done()
        })
      })
    })
  })

  describe('_updateInstance', function () {
    beforeEach(function (done) {
      // normally set by _baseWorkerFindInstance
      ctx.worker.instance = ctx.mockInstance
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(null, ctx.mockInstance)
        done()
      })

      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore()
        done()
      })

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err).to.be.undefined()
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1)
          expect(ctx.mockInstance.modifyContainerInspect.args[0][0])
            .to.equal(ctx.data.id)
          expect(ctx.mockInstance.modifyContainerInspect.args[0][1])
            .to.equal(ctx.data.inspectData)
          done()
        })
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.mockInstance, 'modifyContainerInspect')
          .yieldsAsync(new Error('this is an error'))
        done()
      })

      afterEach(function (done) {
        ctx.mockInstance.modifyContainerInspect.restore()
        done()
      })

      it('should find and update instance with container', function (done) {
        ctx.worker._updateInstance(function (err) {
          expect(err.message).to.equal('this is an error')
          expect(ctx.mockInstance.modifyContainerInspect.callCount).to.equal(1)
          done()
        })
      })
    })
  })
})
