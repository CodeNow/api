/**
 * @module unit/workers/instance.delete
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = require('code').expect
var it = lab.it

var Promise = require('bluebird')
var TaskFatalError = require('ponos').TaskFatalError
var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var ContextVersion = require('models/mongo/context-version')
var rabbitMQ = require('models/rabbitmq')
var Worker = require('workers/context-version.delete')

describe('Context Version Delete Worker', function () {
  describe('worker', function () {
    var testJob = {
      contextVersionId: '572942a3a7c97f0a000895e1'
    }
    var testContextVersion = new ContextVersion({
      _id: '572942a3a7c97f0a000895e1',
      infraCodeVersion: '572942a3a7c97f0a000895e2',
      createdBy: {
        github: 1981198
      },
      prevDockerHost: 'http://10.8.169.199:4242',
      buildDockerfilePath: null,
      context: '5728eda58bdc5c0e007d0d9e',
      owner: {
        github: 2828361
      },
      build: {
        message: 'manual',
        triggeredBy: {
          github: 1981198
        },
        started: '2016-05-04T00:30:43.143Z',
        triggeredAction: {
          manual: true,
          appCodeVersion: {
            commitLog: []
          }
        },
        _id: '572942a3a7c97f0a000895e0'
      },
      advanced: true,
      appCodeVersions: [
        {
          commit: 'ba8e3b2a530122d84391d47426c177b11457876d',
          branch: 'master',
          lowerBranch: 'master',
          repo: 'Runnable/hello-node-rethinkdb',
          lowerRepo: 'runnable/hello-node-rethinkdb',
          _id: '5728edab8bdc5c0e007d0dad',
          privateKey: 'Runnable/hello-node-rethinkdb.key',
          publicKey: 'Runnable/hello-node-rethinkdb.key.pub',
          defaultBranch: 'master',
          useLatest: false,
          transformRules: {
            rename: [],
            replace: [],
            exclude: []
          }
        }
      ],
      dockRemoved: false,
      created: '2016-05-04T00:30:27.598Z',
      id: '572942a3a7c97f0a000895e1'
    })

    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findByIdAsync').resolves(testContextVersion)
      sinon.stub(ContextVersion, 'removeByIdAsync').resolves(testContextVersion)
      sinon.stub(rabbitMQ, 'contextVersionDeleted')
      done()
    })

    afterEach(function (done) {
      ContextVersion.findByIdAsync.restore()
      ContextVersion.removeByIdAsync.restore()
      rabbitMQ.contextVersionDeleted.restore()
      done()
    })

    describe('errors', function () {
      describe('invalid Job', function () {
        it('should require the context version id', function (done) {
          Worker().asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.data.validationError).to.exist()
            expect(err.data.validationError.message)
              .to.match(/job.+required/)
            done()
          })
        })

        it('should require the context version id to be a string', function (done) {
          Worker({ contextVersionId: [1, 2, 3] }).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.data.validationError).to.exist()
            expect(err.data.validationError.message)
              .to.match(/must.+be.+string/)
            done()
          })
        })
      })

      describe('context version not found', function () {
        it('should throw a task fatal error if the context-version was not found', function (done) {
          ContextVersion.findByIdAsync.resolves(null)
          Worker(testJob).asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.be.instanceOf(TaskFatalError)
            expect(err.message)
              .to.match(/contextversion.+not.+found/i)
            done()
          })
        })
      })
    })

    it('should return no error', function (done) {
      Worker(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should find a context version by id', function (done) {
      Worker(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersion.findByIdAsync)
        sinon.assert.calledWithExactly(ContextVersion.findByIdAsync, testContextVersion._id.toString())
        done()
      })
    })

    it('should remove the mongo model', function (done) {
      Worker(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersion.removeByIdAsync)
        sinon.assert.calledWith(ContextVersion.removeByIdAsync, testContextVersion._id.toString())
        done()
      })
    })

    it('should publish an event that the context version was deleted', function (done) {
      Worker(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(rabbitMQ.contextVersionDeleted)
        sinon.assert.calledWith(rabbitMQ.contextVersionDeleted, {
          contextVersion: testContextVersion
        })
        done()
      })
    })
  })
})
