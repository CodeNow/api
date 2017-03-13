'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const expect = Code.expect
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const AutoIsolationService = require('models/services/auto-isolation-service')
const Instance = require('models/mongo/instance')

const rabbitMQ = require('models/rabbitmq')
const octobear = require('@runnable/octobear')

require('sinon-as-promised')(Promise)


describe('AutoIsolationService', () => {
  const ownedByOrg = 10000
  const createdByUser = 2000
  const instance = objectId('007f191e810c19729de860ef')
  const requestedDependencies = [
    {
      instance: objectId('107f191e810c19729de860ef')
    },
    {
      instance: objectId('207f191e810c19729de860ef')
    }
  ]
  describe('createOrUpdateAndEmit', () => {
    let configProps = {
      instance,
      requestedDependencies,
      createdByUser,
      ownedByOrg
    }
    let notFoundError
    let autoIsolationConfig
    beforeEach((done) => {
      notFoundError = new AutoIsolationConfig.NotFoundError('nope')
      autoIsolationConfig = new AutoIsolationConfig(configProps)
      done()
    })
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'createAsync').resolves(autoIsolationConfig)
      sinon.stub(AutoIsolationConfig, 'findActiveByInstanceId').rejects(notFoundError)
      sinon.stub(rabbitMQ, 'autoIsolationConfigCreated').returns()
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.createAsync.restore()
      AutoIsolationConfig.findActiveByInstanceId.restore()
      rabbitMQ.autoIsolationConfigCreated.restore()
      done()
    })
    describe('errors', () => {
      it('should fail if AutoIsolationConfig.createAsync failed', (done) => {
        const error = new Error('Some error')
        AutoIsolationConfig.createAsync.rejects(error)
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should fail if rabbit failed', (done) => {
        const error = new Error('Some error')
        rabbitMQ.autoIsolationConfigCreated.throws(error)
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', () => {
      it('should be successful and return saved model', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap((config) => {
          expect(config._id).to.exist()
          expect(config.created).to.exist()
          expect(config.createdByUser).to.equal(configProps.createdByUser)
          expect(config.ownedByOrg).to.equal(configProps.ownedByOrg)
          expect(config.instance).to.equal(configProps.instance)
          expect(config.requestedDependencies.length).to.equal(2)
        })
        .asCallback(done)
      })

      it('should call AutoIsolationConfig.createAsync properly', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap(() => {
          sinon.assert.calledOnce(AutoIsolationConfig.createAsync)
          sinon.assert.calledWithExactly(AutoIsolationConfig.createAsync, configProps)
        })
        .asCallback(done)
      })

      it('should call rabbitMQ.autoIsolationConfigCreated properly', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap((config) => {
          sinon.assert.calledOnce(rabbitMQ.autoIsolationConfigCreated)
          const newEvent = {
            autoIsolationConfig: { id: config._id.toString() },
            user: {
              id: createdByUser
            },
            organization: {
              id: ownedByOrg
            }
          }
          sinon.assert.calledWithExactly(rabbitMQ.autoIsolationConfigCreated, newEvent)
        })
        .asCallback(done)
      })

      it('should call in order', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap(() => {
          sinon.assert.callOrder(AutoIsolationConfig.createAsync, rabbitMQ.autoIsolationConfigCreated)
        })
        .asCallback(done)
      })
    })
    describe('Updating', () => {
      beforeEach((done) => {
        AutoIsolationConfig.findActiveByInstanceId.resolves(autoIsolationConfig)
        done()
      })
      beforeEach((done) => {
        sinon.stub(autoIsolationConfig, 'saveAsync').resolves(autoIsolationConfig)
        sinon.stub(autoIsolationConfig, 'set').returns()
        done()
      })
      it('should update the model if it already exists', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
          .tap((autoIsolationConfig) => {
            sinon.assert.calledOnce(AutoIsolationConfig.findActiveByInstanceId)
            sinon.assert.calledOnce(autoIsolationConfig.set)
            sinon.assert.calledWithExactly(autoIsolationConfig.set, configProps)
            sinon.assert.calledOnce(autoIsolationConfig.saveAsync)
          })
          .asCallback(done)
      })
      it('should call in order', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
          .tap(() => {
            sinon.assert.callOrder(
              AutoIsolationConfig.findActiveByInstanceId,
              autoIsolationConfig.set,
              autoIsolationConfig.saveAsync,
              rabbitMQ.autoIsolationConfigCreated
            )
          })
          .asCallback(done)
      })
      it('should call rabbitMQ.autoIsolationConfigCreated properly', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
          .tap((config) => {
            sinon.assert.calledOnce(rabbitMQ.autoIsolationConfigCreated)
            const newEvent = {
              autoIsolationConfig: { id: config._id.toString() },
              user: {
                id: createdByUser
              },
              organization: {
                id: ownedByOrg
              }
            }
            sinon.assert.calledWithExactly(rabbitMQ.autoIsolationConfigCreated, newEvent)
          })
          .asCallback(done)
      })
    })
  })

  describe('fetchAutoIsolationDependentInstances', () => {
    let mockAutoIsolationConfig = {
      instance,
      requestedDependencies,
      createdByUser,
      ownedByOrg
    }
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'findActiveByInstanceId').resolves(mockAutoIsolationConfig)
      sinon.stub(Instance, 'findByIdAsync', function (instanceId) {
        return Promise.resolve({
          _id: instanceId
        })
      })
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.findActiveByInstanceId.restore()
      Instance.findByIdAsync.restore()
      done()
    })
    describe('errors', () => {
      it('should fail if AutoIsolationConfig.findActiveByInstanceId failed', (done) => {
        const error = new Error('Some error')
        AutoIsolationConfig.findActiveByInstanceId.rejects(error)
        AutoIsolationService.fetchAutoIsolationDependentInstances(instance)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should fail if Instance.findByIdAsync failed', (done) => {
        const error = new Error('Some error')
        Instance.findByIdAsync.restore()
        sinon.stub(Instance, 'findByIdAsync').rejects(error)
        AutoIsolationService.fetchAutoIsolationDependentInstances(instance)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('success', () => {
      it('should pass without failure', (done) => {
        AutoIsolationService.fetchAutoIsolationDependentInstances(instance)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            done()
          })
      })
      it('should resolve with an instance for each dep', (done) => {
        AutoIsolationService.fetchAutoIsolationDependentInstances(instance)
          .then(function (instances) {
            expect(instances.length).to.equal(2)
            sinon.assert.calledTwice(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, requestedDependencies[0].instance)
            sinon.assert.calledWith(Instance.findByIdAsync, requestedDependencies[1].instance)
          })
          .asCallback(done)
      })
      it('should filter out a dep without an instanceId', (done) => {
        const changedDeps = [
          { instance: objectId('107f191e810c19729de860ef') }, {}
        ]
        AutoIsolationConfig.findActiveByInstanceId.resolves({
          instance,
          requestedDependencies: changedDeps
        })
        AutoIsolationService.fetchAutoIsolationDependentInstances(instance)
          .then(function (instances) {
            expect(instances.length).to.equal(1)
            sinon.assert.calledOnce(Instance.findByIdAsync)
            sinon.assert.calledWith(Instance.findByIdAsync, changedDeps[0].instance)
          })
          .asCallback(done)
      })
    })
  })
})

