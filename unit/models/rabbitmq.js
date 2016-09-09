/**
 * @module unit/models/rabbitmq
 */
'use strict'

var clone = require('101/clone')
var Code = require('code')
var createCount = require('callback-count')
var Lab = require('lab')
var Promise = require('bluebird')
var rabbitMQ = require('models/rabbitmq')
var sinon = require('sinon')

var lab = exports.lab = Lab.script()

var it = lab.it
var describe = lab.describe
var beforeEach = lab.beforeEach
var expect = Code.expect

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('RabbitMQ Model: ' + moduleName, function () {
  beforeEach(function (done) {
    rabbitMQ._publisher = {
      connect: sinon.stub(),
      disconnect: sinon.stub(),
      publishEvent: sinon.stub(),
      publishTask: sinon.stub()
    }
    done()
  })

  describe('connect', function () {
    it('should call connect', function (done) {
      rabbitMQ._publisher.connect.returns(Promise.resolve())
      var out = rabbitMQ.connect().asCallback(function (err) {
        if (err) { return done(err) }
        expect(out).to.be.an.instanceof(Promise)
        sinon.assert.calledOnce(rabbitMQ._publisher.connect)
        done()
      })
    })
  })

  describe('disconnect', function () {
    it('should call disconnect', function (done) {
      rabbitMQ._publisher.disconnect.returns('foo')
      var out = rabbitMQ.disconnect()
      expect(out).to.equal('foo')
      sinon.assert.calledOnce(rabbitMQ._publisher.disconnect)
      done()
    })
  })

  describe('CreateImageBuilderContainer', function () {
    var validJobData

    beforeEach(function (done) {
      validJobData = {
        manualBuild: {
          user: 'asdaSDFASDF'
        },
        sessionUserGithubId: 'asdaSDFASDF',
        contextId: '4G23G243G4545',
        contextVersionId: 'G45GH4GERGDSG',
        contextVersionBuildId: 'G45GH4GERGFSG',
        dockerHost: '0.0.0.0',
        noCache: false,
        ownerUsername: 'tjmehta'
      }
      done()
    })

    describe('success', function () {
      it('should publish a job with required data', function (done) {
        rabbitMQ.createImageBuilderContainer(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'container.image-builder.create',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.createImageBuilderContainer(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('startInstanceContainer', function () {
    var validJobData

    beforeEach(function (done) {
      validJobData = {
        containerId: '123',
        instanceId: '55555',
        sessionUserGithubId: '9494949'
      }
      done()
    })

    describe('success', function () {
      it('should publish a job with required data', function (done) {
        rabbitMQ.startInstanceContainer(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.start',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.startInstanceContainer(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('createInstanceContainer', function () {
    var opts
    beforeEach(function (done) {
      opts = {
        contextVersionId: '123456789012345678901234',
        instanceId: '123456789012345678901234',
        ownerUsername: 'runnable',
        sessionUserGithubId: '10'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.createInstanceContainer(opts)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.container.create',
          opts)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(opts)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(opts)
          delete options[key]
          try {
            rabbitMQ.createInstanceContainer(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('redeployInstanceContainer', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instanceId: '507f191e810c19729de860ea',
        sessionUserGithubId: 429706
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.redeployInstanceContainer(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.container.redeploy',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.redeployInstanceContainer(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('deleteInstance', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instanceId: '507f191e810c19729de860ea'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.deleteInstance(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.delete',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.deleteInstance(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('deleteInstanceContainer', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
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
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.deleteInstanceContainer(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.container.delete',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.deleteInstanceContainer(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('publishInstanceRebuild', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instanceId: '507f1f77bcf86cd799439011'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.publishInstanceRebuild(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.rebuild',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.publishInstanceRebuild(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('instanceUpdated', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instance: '507f1f77bcf86cd799439011'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.instanceUpdated(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'instance.updated',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.instanceUpdated(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('instanceCreated', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instance: {id: 1234}
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.instanceCreated(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'instance.created',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.instanceCreated(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('instanceDeleted', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instance: {id: 1234}
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.instanceDeleted(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'instance.deleted',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.instanceDeleted(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('instanceDeployed', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        instanceId: 1234,
        cvId: 56789
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.instanceDeployed(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'instance.deployed',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.instanceDeployed(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('firstDockCreated', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        githubId: 123
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.firstDockCreated(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'first.dock.created',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.firstDockCreated(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('deleteContextVersion', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        contextVersionId: 1234
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.deleteContextVersion(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'context-version.delete',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.deleteContextVersion(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('contextVersionDeleted', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        contextVersion: { _id: 1 }
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.contextVersionDeleted(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'context-version.deleted',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.contextVersionDeleted(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  })

  describe('publishContainerImageBuilderStarted', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        inspectData: { id: 1234 }
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.publishContainerImageBuilderStarted(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'container.image-builder.started',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.publishContainerImageBuilderStarted(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end publishContainerImageBuilderStarted

  describe('publishDockRemoved', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        githubId: 1234,
        host: 'http://10.0.0.1:4242'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.publishDockRemoved(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'dock.removed',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.publishDockRemoved(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end publishDockRemoved

  describe('clearContainerMemory', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        containerId: 'abcd'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.clearContainerMemory(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'container.resource.clear',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.clearContainerMemory(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end clearContainerMemory

  describe('killInstanceContainer', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        containerId: 'abcd',
        instanceId: 'efgh'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.killInstanceContainer(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'instance.kill',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.killInstanceContainer(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end killInstanceContainer

  describe('killIsolation', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        isolationId: 'efgh',
        triggerRedeploy: true
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.killIsolation(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'isolation.kill',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.killIsolation(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end killIsolation

  describe('redeployIsolation', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        isolationId: 'efgh'
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.redeployIsolation(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishTask)
        sinon.assert.calledWith(rabbitMQ._publisher.publishTask,
          'isolation.redeploy',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.redeployIsolation(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end redeployIsolation

  describe('instanceContainerErrored', function () {
    var validJobData
    beforeEach(function (done) {
      validJobData = {
        containerId: 'efgh',
        instanceId: '12341234',
        error: new Error('black')
      }
      done()
    })

    describe('success', function () {
      it('should create a job', function (done) {
        rabbitMQ.instanceContainerErrored(validJobData)
        sinon.assert.calledOnce(rabbitMQ._publisher.publishEvent)
        sinon.assert.calledWith(rabbitMQ._publisher.publishEvent,
          'instance.container.errored',
          validJobData)
        done()
      })
    })

    describe('validation errors', function () {
      it('should throw the validation error', function (done) {
        var requiredKeys = Object.keys(validJobData)
        var count = createCount(requiredKeys.length, done)
        requiredKeys.forEach(function (key) {
          var options = clone(validJobData)
          delete options[key]
          try {
            rabbitMQ.instanceContainerErrored(options)
          } catch (e) {
            expect(e).to.exist()
            expect(e.message).match(new RegExp(key))
          }
          count.next()
        })
      })
    })
  }) // end instanceContainerErrored
})
