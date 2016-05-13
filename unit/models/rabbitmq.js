/**
 * @module unit/models/rabbitmq
 */
'use strict'

var EventEmitter = require('events').EventEmitter
var util = require('util')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var noop = require('101/noop')
var sinon = require('sinon')
var Code = require('code')
var clone = require('101/clone')
var createCount = require('callback-count')
var rabbitMQ = require('models/rabbitmq')
var hermes = require('runnable-hermes')

var it = lab.it
var describe = lab.describe
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var expect = Code.expect

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('RabbitMQ Model: ' + moduleName, function () {
  var ctx
  beforeEach(function (done) {
    ctx = {}
    ctx.rabbitMQ = rabbitMQ
    done()
  })

  describe('close', function () {
    it('should just callback if the rabbitmq is not started', function (done) {
      ctx.rabbitMQ.close(done)
    })
  })

  describe('unloadWorkers', function () {
    it('should just callback if the rabbitmq is not started', function (done) {
      ctx.rabbitMQ.unloadWorkers(done)
    })
  })

  describe('_handleFatalError', function () {
    it('should call process.exit', function (done) {
      sinon.stub(process, 'exit', function (code) {
        expect(code).to.equal(1)
      })
      var rabbit = new rabbitMQ.constructor()
      rabbit._handleFatalError(new Error())
      expect(process.exit.callCount).to.equal(1)
      process.exit.restore()
      done()
    })
  })

  describe('connect', function () {
    it('should call hermes connect and attach error handler', function (done) {
      var rabbit = new rabbitMQ.constructor()
      var HermesClient = function () {}
      util.inherits(HermesClient, EventEmitter)
      HermesClient.prototype.connect = function (cb) {
        cb(null)
      }
      var hermesClient = new HermesClient()
      sinon.spy(hermesClient, 'connect')
      sinon.spy(hermesClient, 'on')
      sinon.stub(hermes, 'hermesSingletonFactory', function () {
        return hermesClient
      })

      rabbit.connect(function (err) {
        expect(err).to.be.null()
        expect(hermesClient.connect.callCount).to.equal(1)
        expect(hermesClient.on.callCount).to.equal(1)
        hermes.hermesSingletonFactory.restore()
        done()
      })
    })

    it('should call _handleFatalError if error was emitted', function (done) {
      var rabbit = new rabbitMQ.constructor()
      var HermesClient = function () {}
      util.inherits(HermesClient, EventEmitter)
      HermesClient.prototype.connect = function (cb) {
        cb(null)
      }
      var hermesClient = new HermesClient()
      sinon.spy(hermesClient, 'connect')
      sinon.spy(hermesClient, 'on')
      sinon.stub(hermes, 'hermesSingletonFactory', function () {
        return hermesClient
      })
      sinon.stub(rabbit, '_handleFatalError')
      rabbit.connect(function (err) {
        expect(err).to.be.null()
      })
      rabbit.hermesClient.on('error', function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('Some hermes error')
        expect(hermesClient.connect.callCount).to.equal(1)
        expect(hermesClient.on.callCount).to.equal(2)
        expect(rabbit._handleFatalError.callCount).to.equal(1)
        expect(rabbit._handleFatalError.getCall(0).args[0].message)
          .to.equal('Some hermes error')
        hermes.hermesSingletonFactory.restore()
        done()
      })
      rabbit.hermesClient.emit('error', new Error('Some hermes error'))
    })
  })

  describe('_validate', function () {
    it('should pass validation', function (done) {
      var payload = {
        instance: {
          _id: 1,
          owner: {
            github: 2
          }
        }
      }
      var keys = [ 'instance._id', 'instance.owner.github' ]
      ctx.rabbitMQ._validate(payload, keys, 'job.name')
      done()
    })
    it('should fail validation', function (done) {
      var payload = {
        instance: {
          _id: 1,
          owner: null
        }
      }
      var keys = [ 'instance._id', 'instance.owner.github' ]
      try {
        ctx.rabbitMQ._validate(payload, keys, 'job.name')
        done(new Error('Should never happen'))
      } catch (e) {
        expect(e.message).to.equal('Validation failed: "instance.owner.github" is required')
        done()
      }
    })
  })

  describe('CreateImageBuilderContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      }
      ctx.validJobData = {
        manualBuild: {
          user: 'asdaSDFASDF'
        },
        sessionUserGithubId: 'asdaSDFASDF',
        contextId: '4G23G243G4545',
        contextVersionId: 'G45GH4GERGDSG',
        dockerHost: '0.0.0.0',
        noCache: false,
        tid: '9494949',
        ownerUsername: 'tjmehta'
      }
      // missing manualBuild and noCache
      ctx.invalidJobData = {
        sessionUserGithubId: 'asdaSDFASDF',
        contextId: '4G23G243G4545',
        contextVersionId: 'G45GH4GERGDSG',
        dockerHost: '0.0.0.0',
        tid: '9494949'
      }
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('container.image-builder.create')
          expect(eventData).to.equal(ctx.validJobData)
        })
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.createImageBuilderContainer(ctx.validJobData)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1)
        done()
      })
    })

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {})
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should not publish a job without required data', function (done) {
        expect(ctx.rabbitMQ.createImageBuilderContainer.bind(ctx.rabbitMQ, ctx.invalidJobData))
          .to.throw(Error, /Validation failed/)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })
  describe('startInstanceContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      }
      ctx.validJobData = {
        containerId: '123',
        instanceId: '55555',
        sessionUserGithubId: '9494949',
        tid: '000000'
      }
      // missing containerId
      ctx.invalidJobData = {
        instanceId: '55555',
        sessionUserGithubId: '9494949',
        tid: '000000'
      }
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('start-instance-container')
          expect(eventData).to.equal(ctx.validJobData)
        })
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.startInstanceContainer(ctx.validJobData)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1)
        done()
      })
    })

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {})
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should not publish a job without required data', function (done) {
        expect(ctx.rabbitMQ.startInstanceContainer.bind(ctx.rabbitMQ, ctx.invalidJobData))
          .to.throw(Error, /Validation failed/)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })

  describe('createInstanceContainer', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.opts = {
        contextVersionId: '123456789012345678901234',
        instanceId: '123456789012345678901234',
        ownerUsername: 'runnable',
        sessionUserGithubId: '10'
      }
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })
    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })
    describe('success', function () {
      it('should create a job', function (done) {
        ctx.rabbitMQ.createInstanceContainer(ctx.opts)
        sinon.assert.calledWith(
          ctx.rabbitMQ.hermesClient.publish,
          'create-instance-container',
          ctx.opts
        )
        done()
      })
    })
    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })
      describe('validation errors', function () {
        it('should throw the validation error', function (done) {
          var requiredKeys = Object.keys(ctx.opts)
          var count = createCount(requiredKeys.length, done)
          requiredKeys.forEach(function (key) {
            var opts = clone(ctx.opts)
            delete opts[key]
            try {
              ctx.rabbitMQ.createInstanceContainer(ctx.opts)
            } catch (e) {
              expect(e).to.exist()
              expect(e.message).match(new RegExp(key))
            }
            count.next()
          })
        })
      })
    })
  })

  describe('redeployInstanceContainer', function () {
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: noop
      }
      ctx.validJobData = {
        instanceId: '507f191e810c19729de860ea',
        sessionUserGithubId: 429706
      }
      // missing sessionUserGithubId
      ctx.invalidJobData = {
        instanceId: '507f191e810c19729de860ea'
      }
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('instance.container.redeploy')
          expect(eventData).to.equal(ctx.validJobData)
        })
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.redeployInstanceContainer(ctx.validJobData)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1)
        done()
      })
    })
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {})
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should not publish a job without required data', function (done) {
        expect(ctx.rabbitMQ.redeployInstanceContainer.bind(ctx.rabbitMQ, ctx.invalidJobData))
          .to.throw(Error, /Validation failed/)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })
  describe('deleteInstance', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      sinon.spy(ctx.rabbitMQ, '_validate')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      ctx.rabbitMQ._validate.restore()
      done()
    })

    it('should publish to the `instance.delete` queue', function (done) {
      var payload = {
        instanceId: '507f191e810c19729de860ea'
      }
      ctx.rabbitMQ.deleteInstance(payload)
      sinon.assert.calledOnce(ctx.rabbitMQ._validate)
      var keys = [
        'instanceId'
      ]
      sinon.assert.calledWith(ctx.rabbitMQ._validate, payload, keys, 'instance.delete')
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.delete', payload)
      done()
    })
    it('should fail to publish to the `instance.delete` queue if validation failed', function (done) {
      var payload = {}
      expect(ctx.rabbitMQ.deleteInstance.bind(ctx.rabbitMQ, payload))
        .to.throw(Error, /Validation failed/)
      sinon.assert.calledOnce(ctx.rabbitMQ._validate)
      var keys = [
        'instanceId'
      ]
      sinon.assert.calledWith(ctx.rabbitMQ._validate, payload, keys, 'instance.delete')
      sinon.assert.notCalled(ctx.rabbitMQ.hermesClient.publish)
      done()
    })
  })

  describe('deleteInstanceContainer', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      sinon.spy(ctx.rabbitMQ, '_validate')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      ctx.rabbitMQ._validate.restore()
      done()
    })

    it('should publish to the `delete-instance-container` queue', function (done) {
      var payload = {
        instanceShortHash: 'd1as5f',
        instanceName: 'api',
        instanceMasterPod: true,
        ownerGithubId: 429706,
        ownerGithubUsername: 'runnable',
        hostIp: '10.0.1.1',
        container: {
          dockerHost: 'https://localhost:4242',
          dockerContainer: '6249c3a24d48fbeee444de321ee005a02c388cbaec6b900ac6693bbc7753ccd8'
        }
      }
      ctx.rabbitMQ.deleteInstanceContainer(payload)
      sinon.assert.calledOnce(ctx.rabbitMQ._validate)
      var keys = [
        'container',
        'container.dockerContainer',
        'instanceName',
        'instanceShortHash',
        'instanceMasterPod',
        'ownerGithubId',
        'ownerGithubUsername'
      ]
      sinon.assert.calledWith(ctx.rabbitMQ._validate, payload, keys, 'instance.container.delete')
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.container.delete', payload)
      done()
    })
    it('should fail to publish to the `instance.container.delete` queue if validation failed', function (done) {
      var payload = {}
      expect(ctx.rabbitMQ.deleteInstanceContainer.bind(ctx.rabbitMQ, payload))
        .to.throw(Error, /Validation failed/)
      sinon.assert.calledOnce(ctx.rabbitMQ._validate)
      var keys = [
        'container',
        'container.dockerContainer',
        'instanceName',
        'instanceShortHash',
        'instanceMasterPod',
        'ownerGithubId',
        'ownerGithubUsername'
      ]
      sinon.assert.calledWith(ctx.rabbitMQ._validate, payload, keys, 'instance.container.delete')
      sinon.assert.notCalled(ctx.rabbitMQ.hermesClient.publish)
      done()
    })
  })

  describe('publishASGCreate', function () {
    var testOrgId = 18274533
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      }
      ctx.validJobData = {
        githubId: testOrgId.toString()
      }
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('asg.create')
          expect(eventData).to.equal(ctx.validJobData)
        })
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.publishASGCreate(ctx.validJobData)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1)
        done()
      })
    })

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {})
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should not publish a job without required data', function (done) {
        expect(ctx.rabbitMQ.publishASGCreate.bind(ctx.rabbitMQ, {}))
          .to.throw(Error, /Validation failed/)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })

  describe('publishClusterDeprovision', function () {
    var testOrgId = 18274533
    beforeEach(function (done) {
      // this normally set after connect
      ctx.rabbitMQ.hermesClient = {
        publish: function () {}
      }
      ctx.validJobData = {
        githubId: testOrgId
      }
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function (eventName, eventData) {
          expect(eventName).to.equal('cluster-deprovision')
          expect(eventData).to.equal(ctx.validJobData)
        })
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should publish a job with required data', function (done) {
        ctx.rabbitMQ.publishClusterDeprovision(ctx.validJobData)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(1)
        done()
      })
    })

    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.rabbitMQ.hermesClient, 'publish', function () {})
        done()
      })
      afterEach(function (done) {
        ctx.rabbitMQ.hermesClient.publish.restore()
        done()
      })
      it('should not publish a job without required data', function (done) {
        expect(ctx.rabbitMQ.publishClusterDeprovision.bind(ctx.rabbitMQ, {}))
          .to.throw(Error, /Validation failed/)
        expect(ctx.rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })

  describe('publishInstanceRebuild', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      sinon.spy(ctx.rabbitMQ, '_validate')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      ctx.rabbitMQ._validate.restore()
      done()
    })

    it('should publish to the `instance.rebuild` queue', function (done) {
      var payload = {
        instanceId: '507f1f77bcf86cd799439011'
      }
      ctx.rabbitMQ.publishInstanceRebuild(payload)
      sinon.assert.calledOnce(ctx.rabbitMQ._validate)
      var keys = [ 'instanceId' ]
      sinon.assert.calledWith(ctx.rabbitMQ._validate, payload, keys, 'instance.rebuild')
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.rebuild', payload)
      done()
    })
    it('should fail to publish to the `instance.rebuild` queue if validation failed', function (done) {
      var payload = {}
      expect(ctx.rabbitMQ.publishInstanceRebuild.bind(ctx.rabbitMQ, payload))
        .to.throw(Error, /Validation failed/)
      sinon.assert.calledOnce(ctx.rabbitMQ._validate)
      var keys = [ 'instanceId' ]
      sinon.assert.calledWith(ctx.rabbitMQ._validate, payload, keys, 'instance.rebuild')
      sinon.assert.notCalled(ctx.rabbitMQ.hermesClient.publish)
      done()
    })
  })

  describe('instanceUpdated', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        instance: {id: 1234}
      }
      ctx.rabbitMQ.instanceUpdated(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.updated', data)
      done()
    })
    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.instanceUpdated.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  })

  describe('instanceCreated', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        instance: {id: 1234}
      }
      ctx.rabbitMQ.instanceCreated(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.created', data)
      done()
    })
    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.instanceCreated.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  })

  describe('instanceDeleted', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })
    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        instance: {id: 1234}
      }
      ctx.rabbitMQ.instanceDeleted(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.deleted', data)
      done()
    })
    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.instanceDeleted.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  })

  describe('instanceDeployed', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })
    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        instanceId: 1234,
        cvId: 56789
      }
      ctx.rabbitMQ.instanceDeployed(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'instance.deployed', data)
      done()
    })
    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.instanceDeployed.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  })

  describe('deleteContextVersion', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })
    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        contextVersionId: 1234
      }
      ctx.rabbitMQ.deleteContextVersion(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'context-version.delete', data)
      done()
    })
    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.deleteContextVersion.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  })

  describe('contextVersionDeleted', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })
    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var cv = { _id: 1 }
      var data = {
        contextVersion: cv
      }
      ctx.rabbitMQ.contextVersionDeleted(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(ctx.rabbitMQ.hermesClient.publish, 'context-version.deleted', data)
      done()
    })
    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.deleteContextVersion.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  })

  describe('publishContainerImageBuilderStarted', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        inspectData: { id: 1234 }
      }
      ctx.rabbitMQ.publishContainerImageBuilderStarted(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(
        ctx.rabbitMQ.hermesClient.publish,
        'container.image-builder.started',
        data)
      done()
    })

    it('should throw an error when parameters are missing', function (done) {
      var data = {}
      expect(ctx.rabbitMQ.publishContainerImageBuilderStarted.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  }) // end publishContainerImageBuilderStarted

  describe('publishDockRemoved', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        githubId: 1234,
        host: 'http://10.0.0.1:4242'
      }
      ctx.rabbitMQ.publishDockRemoved(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(
        ctx.rabbitMQ.hermesClient.publish,
        'dock.removed',
        data)
      done()
    })

    it('should throw an error when host is missing', function (done) {
      var data = { githubId: 1234 }
      expect(ctx.rabbitMQ.publishDockRemoved.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })

    it('should throw an error when githubId is missing', function (done) {
      var data = { host: 'http://10.0.0.1:4242' }
      expect(ctx.rabbitMQ.publishDockRemoved.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  }) // end publishDockRemoved

  describe('updateContainerMemory', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        containerId: 'abcd',
        memoryInBytes: 12345
      }
      ctx.rabbitMQ.updateContainerMemory(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(
        ctx.rabbitMQ.hermesClient.publish,
        'container.resource.update',
        data)
      done()
    })

    it('should throw an error when host is missing', function (done) {
      var data = { containerId: 'abcd' }
      expect(ctx.rabbitMQ.updateContainerMemory.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })

    it('should throw an error when githubId is missing', function (done) {
      var data = { memoryInBytes: 12345 }
      expect(ctx.rabbitMQ.updateContainerMemory.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  }) // end updateContainerMemory

  describe('killInstanceContainer', function () {
    beforeEach(function (done) {
      sinon.stub(ctx.rabbitMQ.hermesClient, 'publish')
      done()
    })

    afterEach(function (done) {
      ctx.rabbitMQ.hermesClient.publish.restore()
      done()
    })

    it('should publish the job with the correct payload', function (done) {
      var data = {
        containerId: 'abcd',
        instanceId: 'efgh'
      }
      ctx.rabbitMQ.killInstanceContainer(data)
      sinon.assert.calledOnce(ctx.rabbitMQ.hermesClient.publish)
      sinon.assert.calledWith(
        ctx.rabbitMQ.hermesClient.publish,
        'instance.kill',
        data)
      done()
    })

    it('should throw an error when containerId is missing', function (done) {
      var data = { instanceId: 'efgh' }
      expect(ctx.rabbitMQ.killInstanceContainer.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })

    it('should throw an error when instanceId is missing', function (done) {
      var data = { containerId: 'abcd' }
      expect(ctx.rabbitMQ.killInstanceContainer.bind(ctx.rabbitMQ, data))
        .to.throw(Error, /^Validation failed/)
      done()
    })
  }) // end killInstanceContainer
})
