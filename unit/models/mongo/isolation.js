'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var joi = require('utils/joi')
var Instance = require('models/mongo/instance')

var Isolation = require('models/mongo/isolation')

describe('Isolation Model', function () {
  describe('#_validateCreateData', function () {
    var data

    beforeEach(function (done) {
      data = {
        master: 'deadbeefdeadbeefdeadbeef',
        children: [
          { instance: 'deefdeadbeefdeadbeefdead' },
          { org: 'foo', repo: 'bar', branch: 'baz' }
        ]
      }
      sinon.spy(joi, 'validate')
      done()
    })

    afterEach(function (done) {
      joi.validate.restore()
      done()
    })

    describe('(boom) errors', function () {
      it('should require data', function (done) {
        Isolation._validateCreateData().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/data.+required/)
          done()
        })
      })

      it('should require master', function (done) {
        delete data.master
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/master.+required/)
          done()
        })
      })

      it('should require children', function (done) {
        delete data.children
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+required/)
          done()
        })
      })

      it('should require children to be well formed (instance w/ extra key)', function (done) {
        data.children.pop() // remove the org, repo, branch version
        data.children[0].foo = 'bar'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require children to be well formed (instance w/o object id)', function (done) {
        data.children.pop() // remove the org, repo, branch version
        data.children[0].instance = '4'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require children to be well formed (repo w/ extra key)', function (done) {
        data.children.shift() // remove the instance version
        data.children[0].foo = 'bar'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require children to be well formed (repo w/o some key)', function (done) {
        data.children.shift() // remove the instance version
        delete data.children[0].repo
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require all children to be well formed (one good)', function (done) {
        data.children[0].foo = 'bar'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+0.+not.+match.+allowed.+types/i)
          done()
        })
      })
    })

    it('should validate arguments', function (done) {
      Isolation._validateCreateData(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(joi.validate)
        sinon.assert.calledWith(joi.validate, data)
        done()
      })
    })
  })

  describe('#_validateMasterNotIsolated', function () {
    var instanceId = 'foobar'
    var mockInstance

    beforeEach(function (done) {
      // by default, isolation fields are empty.
      mockInstance = {}
      sinon.stub(Instance, 'findById').yieldsAsync(null, mockInstance)
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      done()
    })

    it('should find the instance in the database', function (done) {
      Isolation._validateMasterNotIsolated(instanceId).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findById)
        sinon.assert.calledWithExactly(
          Instance.findById,
          instanceId,
          sinon.match.func
        )
        done()
      })
    })

    it('should return instance if valid for isolation', function (done) {
      Isolation._validateMasterNotIsolated(instanceId).asCallback(function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.equal(mockInstance)
        done()
      })
    })

    describe('errors', function () {
      it('should require an instance id', function (done) {
        Isolation._validateMasterNotIsolated().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/requires instanceid/i)
          expect(err.output.statusCode).to.equal(500)
          done()
        })
      })

      it('should return any mongoose error', function (done) {
        var error = new Error('pugsly')
        Instance.findById.yieldsAsync(error)
        Isolation._validateMasterNotIsolated(instanceId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return a not found boom error if instance not found', function (done) {
        Instance.findById.yieldsAsync(null, null)
        Isolation._validateMasterNotIsolated(instanceId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/instance not found/i)
          expect(err.output.statusCode).to.equal(404)
          done()
        })
      })

      it('should return a conflict boom error if instance is in an isolation group', function (done) {
        mockInstance.isolated = 'someid'
        Isolation._validateMasterNotIsolated(instanceId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/instance belongs to an isolation group/i)
          expect(err.output.statusCode).to.equal(409)
          done()
        })
      })

      it('should return a conflict boom error if instance is in an isolation master', function (done) {
        mockInstance.isIsolationGroupMaster = true
        Isolation._validateMasterNotIsolated(instanceId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/instance is already isolated/i)
          expect(err.output.statusCode).to.equal(409)
          done()
        })
      })
    })
  })

  describe('#createIsolation', function () {
    var data
    var mockMasterInstance = {
      id: 'masterInstanceId',
      owner: { github: 'ownerGithubId' },
      createdBy: { github: 'createdByGithubId' }
    }
    var childRepo = { instance: 'childInstanceId' }
    var childNonRepo = {
      org: 'bar',
      repo: 'foo',
      branch: 'baz'
    }
    var mockIsolation = {}

    beforeEach(function (done) {
      data = {
        master: 'masterInstanceId',
        children: [ childRepo, childNonRepo ]
      }
      sinon.stub(Isolation, 'create').yieldsAsync(null, mockIsolation)
      sinon.stub(Isolation, '_validateCreateData').resolves()
      sinon.stub(Isolation, '_validateMasterNotIsolated').resolves(mockMasterInstance)
      done()
    })

    afterEach(function (done) {
      Isolation.create.restore()
      Isolation._validateCreateData.restore()
      Isolation._validateMasterNotIsolated.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with error when validation fails', function (done) {
        var error = new Error('foo')
        Isolation._validateCreateData.rejects(error)
        Isolation.createIsolation(data).asCallback(function (err) {
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with error when master instance validation fails', function (done) {
        var error = new Error('pugsly')
        Isolation._validateMasterNotIsolated.rejects(error)
        Isolation.createIsolation(data).asCallback(function (err) {
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any isolation creation error', function (done) {
        var error = new Error('pugsly')
        Isolation.create.yieldsAsync(error)
        Isolation.createIsolation(data).asCallback(function (err) {
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should validate the data', function (done) {
      Isolation.createIsolation(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation._validateCreateData)
        sinon.assert.calledWithExactly(
          Isolation._validateCreateData,
          data
        )
        done()
      })
    })

    it('should validate the master instance is valid', function (done) {
      Isolation.createIsolation(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation._validateMasterNotIsolated)
        sinon.assert.calledWithExactly(
          Isolation._validateMasterNotIsolated,
          'masterInstanceId'
        )
        done()
      })
    })

    it('should create a new isolation', function (done) {
      Isolation.createIsolation(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation.create)
        sinon.assert.calledWithExactly(
          Isolation.create,
          {
            owner: { github: 'ownerGithubId' },
            createdBy: { github: 'createdByGithubId' }
          },
          sinon.match.func
        )
        done()
      })
    })

    it('should resolve with the new isolation', function (done) {
      Isolation.createIsolation(data).asCallback(function (err, newIsolation) {
        expect(err).to.not.exist()
        expect(newIsolation).to.equal(mockIsolation)
        done()
      })
    })
  })
})
