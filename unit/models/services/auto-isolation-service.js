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
  describe('createAndEmit', () => {
    let configProps = {
      instance,
      requestedDependencies,
      createdByUser,
      ownedByOrg
    }
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'createAsync').resolves(new AutoIsolationConfig(configProps))
      sinon.stub(rabbitMQ, 'autoIsolationConfigCreated').returns()
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.createAsync.restore()
      rabbitMQ.autoIsolationConfigCreated.restore()
      done()
    })
    describe('errors', () => {
      it('should fail if AutoIsolationConfig.createAsync failed', (done) => {
        const error = new Error('Some error')
        AutoIsolationConfig.createAsync.rejects(error)
        AutoIsolationService.createAndEmit(configProps)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should fail if rabbit failed', (done) => {
        const error = new Error('Some error')
        rabbitMQ.autoIsolationConfigCreated.throws(error)
        AutoIsolationService.createAndEmit(configProps)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', () => {
      it('should be successful and return saved model', (done) => {
        AutoIsolationService.createAndEmit(configProps)
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
        AutoIsolationService.createAndEmit(configProps)
        .tap(() => {
          sinon.assert.calledOnce(AutoIsolationConfig.createAsync)
          sinon.assert.calledWithExactly(AutoIsolationConfig.createAsync, configProps)
        })
        .asCallback(done)
      })

      it('should call rabbitMQ.autoIsolationConfigCreated properly', (done) => {
        AutoIsolationService.createAndEmit(configProps)
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
        AutoIsolationService.createAndEmit(configProps)
        .tap(() => {
          sinon.assert.callOrder(AutoIsolationConfig.createAsync, rabbitMQ.autoIsolationConfigCreated)
        })
        .asCallback(done)
      })
    })
  })
})

