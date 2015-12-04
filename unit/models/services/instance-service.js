/**
 * @module unit/models/services/instance-service
 */
var clone = require('101/clone')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var sinon = require('sinon')
var Boom = require('dat-middleware').Boom
var Code = require('code')
var Promise = require('bluebird')

var cleanMongo = require('../../../test/functional/fixtures/clean-mongo.js')
var ContextVersion = require('models/mongo/context-version')
var Docker = require('models/apis/docker')
var dock = require('../../../test/functional/fixtures/dock')
var mongo = require('../../fixtures/mongo')
var Hashids = require('hashids')
var InstanceService = require('models/services/instance-service')
var Instance = require('models/mongo/instance')
var Mavis = require('models/apis/mavis')
var joi = require('utils/joi')
var rabbitMQ = require('models/rabbitmq')
var validation = require('../../fixtures/validation')(lab)
var messenger = require('socket/messenger')
var User = require('models/mongo/user')

var afterEach = lab.afterEach
var after = lab.after
var beforeEach = lab.beforeEach
var before = lab.before
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist()
    expect(err).to.equal(expectedErr)
    done()
  }
}

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

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

describe('InstanceService: ' + moduleName, function () {
  var ctx
  before(dock.start)
  before(mongo.connect)
  beforeEach(cleanMongo.removeEverything)
  after(dock.stop)
  beforeEach(function (done) {
    ctx = {}
    done()
  })

  describe('#deleteForkedInstancesByRepoAndBranch', function () {
    it('should return if instanceId param is missing', function (done) {
      var instanceService = new InstanceService()
      sinon.spy(Instance, 'findForkedInstances')
      instanceService.deleteForkedInstancesByRepoAndBranch(null, 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if user param is missing', function (done) {
      var instanceService = new InstanceService()
      sinon.spy(Instance, 'findForkedInstances')
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', null, 'api', 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if repo param is missing', function (done) {
      var instanceService = new InstanceService()
      sinon.spy(Instance, 'findForkedInstances')
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', null, 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return if branch param is missing', function (done) {
      var instanceService = new InstanceService()
      sinon.spy(Instance, 'findForkedInstances')
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', null,
        function (err) {
          expect(err).to.not.exist()
          expect(Instance.findForkedInstances.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should return error if #findForkedInstances failed', function (done) {
      var instanceService = new InstanceService()
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(new Error('Some error'))
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal('Some error')
          Instance.findForkedInstances.restore()
          done()
        })
    })

    it('should not create new jobs if instances were not found', function (done) {
      var instanceService = new InstanceService()
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, [])
      sinon.stub(rabbitMQ, 'deleteInstance')
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(rabbitMQ.deleteInstance.callCount).to.equal(0)
          Instance.findForkedInstances.restore()
          rabbitMQ.deleteInstance.restore()
          done()
        })
    })

    it('should create 2 jobs if 3 instances were found and 1 filtered', function (done) {
      var instanceService = new InstanceService()
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, [{_id: 'inst-1'}, {_id: 'inst-2'}, {_id: 'inst-3'}])
      sinon.stub(rabbitMQ, 'deleteInstance')
      instanceService.deleteForkedInstancesByRepoAndBranch('inst-2', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist()
          expect(rabbitMQ.deleteInstance.callCount).to.equal(2)
          var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0]
          expect(arg1.instanceId).to.equal('inst-1')
          expect(arg1.sessionUserId).to.equal('user-id')
          var arg2 = rabbitMQ.deleteInstance.getCall(1).args[0]
          expect(arg2.instanceId).to.equal('inst-3')
          expect(arg2.sessionUserId).to.equal('user-id')
          Instance.findForkedInstances.restore()
          rabbitMQ.deleteInstance.restore()
          done()
        })
    })
  })

  describe('updateOnContainerStart', function () {
    describe('with db calls', function () {
      var ctx = {}

      beforeEach(function (done) {
        var instance = createNewInstance('testy', {})
        ctx.containerId = instance.container.dockerContainer
        sinon.spy(instance, 'invalidateContainerDNS')
        expect(instance.network.hostIp).to.equal('1.1.1.100')
        instance.save(function (err, instance) {
          if (err) { return done(err) }
          ctx.instance = instance
          ctx.inspect = {
            Config: {
              Labels: {
                instanceId: ctx.instance._id,
                ownerUsername: 'anton',
                sessionUserGithubId: 111987,
                contextVersionId: 'some-cv-id'
              }
            },
            State: {
              ExitCode: 0,
              FinishedAt: '0001-01-01T00:00:00Z',
              Paused: false,
              Pid: 889,
              Restarting: false,
              Running: true,
              StartedAt: '2014-11-25T22:29:50.23925175Z'
            },
            NetworkSettings: {
              IPAddress: '172.17.14.13',
              Ports: {
                '3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34109'}],
                '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34110'}],
                '8000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34111'}],
                '8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34108'}]
              }
            }
          }
          done()
        })
      })
      afterEach(function (done) {
        // cache invalidation should be always called
        expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true()
        done()
      })
      it('should return modified instance from database', function (done) {
        var instanceService = new InstanceService()
        instanceService.updateOnContainerStart(ctx.instance, ctx.containerId, '127.0.0.2', ctx.inspect,
          function (err, updated) {
            expect(err).to.not.exist()
            expect(updated._id.toString()).to.equal(ctx.instance._id.toString())
            expect(updated.network.hostIp).to.equal('127.0.0.2')
            expect(updated.container.inspect.NetworkSettings.IPAddress).to.equal(ctx.inspect.NetworkSettings.IPAddress)
            expect(updated.container.inspect.NetworkSettings.Ports).to.deep.equal(ctx.inspect.NetworkSettings.Ports)
            expect(updated.container.inspect.Config.Labels).to.deep.equal(ctx.inspect.Config.Labels)
            expect(updated.container.inspect.State).to.deep.equal(ctx.inspect.State)
            expect(updated.container.ports).to.deep.equal(ctx.inspect.NetworkSettings.Ports)
            done()
          })
      })
    })
    describe('without db calls', function () {
      var ctx = {}

      beforeEach(function (done) {
        ctx.instance = createNewInstance('testy', {})
        ctx.inspect = {
          Config: {
            Labels: {
              instanceId: ctx.instance._id,
              ownerUsername: 'anton',
              sessionUserGithubId: 111987,
              contextVersionId: 'some-cv-id'
            }
          },
          State: {
            ExitCode: 0,
            FinishedAt: '0001-01-01T00:00:00Z',
            Paused: false,
            Pid: 889,
            Restarting: false,
            Running: true,
            StartedAt: '2014-11-25T22:29:50.23925175Z'
          },
          NetworkSettings: {
            IPAddress: '172.17.14.13',
            Ports: {
              '3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34109'}],
              '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34110'}],
              '8000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34111'}],
              '8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34108'}]
            }
          }
        }
        ctx.containerId = ctx.instance.container.dockerContainer
        sinon.spy(ctx.instance, 'invalidateContainerDNS')
        done()
      })

      afterEach(function (done) {
        // cache invalidation should be always called
        expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true()
        expect(Instance.findOneAndUpdate.calledOnce).to.be.true()
        var query = Instance.findOneAndUpdate.getCall(0).args[0]
        var setQuery = Instance.findOneAndUpdate.getCall(0).args[1]
        expect(query._id).to.equal(ctx.instance._id)
        expect(query['container.dockerContainer']).to.equal(ctx.containerId)
        expect(setQuery.$set['network.hostIp']).to.equal('127.0.0.1')
        expect(setQuery.$set['container.inspect']).to.exist()
        expect(setQuery.$set['container.ports']).to.exist()
        expect(Object.keys(setQuery.$set).length).to.equal(3)
        ctx.instance.invalidateContainerDNS.restore()
        Instance.findOneAndUpdate.restore()
        done()
      })

      it('should return an error if findOneAndUpdate failed', function (done) {
        var instanceService = new InstanceService()
        var mongoErr = new Error('Mongo error')
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(mongoErr)
        instanceService.updateOnContainerStart(ctx.instance, ctx.containerId, '127.0.0.1', ctx.inspect, function (err) {
          expect(err.message).to.equal('Mongo error')
          done()
        })
      })
      it('should return an error if findOneAndUpdate returned nothing', function (done) {
        var instanceService = new InstanceService()
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, null)
        instanceService.updateOnContainerStart(ctx.instance, ctx.containerId, '127.0.0.1', ctx.inspect, function (err) {
          expect(err.output.statusCode).to.equal(409)
          var errMsg = "Container IP was not updated, instance's container has changed"
          expect(err.output.payload.message).to.equal(errMsg)
          done()
        })
      })
      it('should return modified instance', function (done) {
        var instanceService = new InstanceService()
        var instance = new Instance({_id: ctx.instance._id, name: 'updated-instance'})
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, instance)
        instanceService.updateOnContainerStart(ctx.instance, ctx.containerId, '127.0.0.1', ctx.inspect,
          function (err, updated) {
            expect(err).to.not.exist()
            expect(updated._id).to.equal(ctx.instance._id)
            expect(updated.name).to.equal(instance.name)
            done()
          })
      })
    })
  })

  describe('updateOnContainerDie', function () {
    describe('with db calls', function () {
      var ctx = {}

      beforeEach(function (done) {
        var instance = createNewInstance('testy', {})
        ctx.containerId = instance.container.dockerContainer
        sinon.spy(instance, 'invalidateContainerDNS')
        expect(instance.network.hostIp).to.equal('1.1.1.100')
        instance.save(function (err, instance) {
          if (err) { return done(err) }
          ctx.instance = instance
          ctx.inspect = {
            Config: {
              Labels: {
                instanceId: ctx.instance._id,
                ownerUsername: 'anton',
                sessionUserGithubId: 111987,
                contextVersionId: 'some-cv-id'
              }
            },
            State: {
              ExitCode: 0,
              FinishedAt: '0001-01-01T00:00:00Z',
              Paused: false,
              Pid: 889,
              Restarting: false,
              Running: true,
              StartedAt: '2014-11-25T22:29:50.23925175Z'
            },
            NetworkSettings: {
              IPAddress: '172.17.14.13',
              Ports: {
                '3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34109'}],
                '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34110'}],
                '8000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34111'}],
                '8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34108'}]
              }
            }
          }
          done()
        })
      })
      afterEach(function (done) {
        // cache invalidation should be always called
        expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true()
        done()
      })
      it('should return modified instance from database', function (done) {
        var instanceService = new InstanceService()
        instanceService.updateOnContainerDie(ctx.instance, ctx.containerId, ctx.inspect,
          function (err, updated) {
            expect(err).to.not.exist()
            expect(updated._id.toString()).to.equal(ctx.instance._id.toString())
            expect(updated.container.inspect.NetworkSettings.IPAddress).to.equal(ctx.inspect.NetworkSettings.IPAddress)
            expect(updated.container.inspect.NetworkSettings.Ports).to.deep.equal(ctx.inspect.NetworkSettings.Ports)
            expect(updated.container.inspect.Config.Labels).to.deep.equal(ctx.inspect.Config.Labels)
            expect(updated.container.inspect.State).to.deep.equal(ctx.inspect.State)
            expect(updated.container.ports).to.deep.equal(ctx.inspect.NetworkSettings.Ports)
            done()
          })
      })
    })
    describe('without db calls', function () {
      var ctx = {}

      beforeEach(function (done) {
        ctx.instance = createNewInstance('testy', {})
        ctx.inspect = {
          Config: {
            Labels: {
              instanceId: ctx.instance._id,
              ownerUsername: 'anton',
              sessionUserGithubId: 111987,
              contextVersionId: 'some-cv-id'
            }
          },
          State: {
            ExitCode: 0,
            FinishedAt: '0001-01-01T00:00:00Z',
            Paused: false,
            Pid: 889,
            Restarting: false,
            Running: true,
            StartedAt: '2014-11-25T22:29:50.23925175Z'
          },
          NetworkSettings: {
            IPAddress: '172.17.14.13',
            Ports: {
              '3000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34109'}],
              '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34110'}],
              '8000/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34111'}],
              '8080/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '34108'}]
            }
          }
        }
        ctx.containerId = ctx.instance.container.dockerContainer
        sinon.spy(ctx.instance, 'invalidateContainerDNS')
        done()
      })

      afterEach(function (done) {
        // cache invalidation should be always called
        expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true()
        expect(Instance.findOneAndUpdate.calledOnce).to.be.true()
        var query = Instance.findOneAndUpdate.getCall(0).args[0]
        var setQuery = Instance.findOneAndUpdate.getCall(0).args[1]
        expect(query._id).to.equal(ctx.instance._id)
        expect(query['container.dockerContainer']).to.equal(ctx.containerId)
        expect(setQuery.$set['container.inspect']).to.exist()
        expect(setQuery.$set['container.ports']).to.exist()
        expect(Object.keys(setQuery.$set).length).to.equal(2)
        ctx.instance.invalidateContainerDNS.restore()
        Instance.findOneAndUpdate.restore()
        done()
      })

      it('should return an error if findOneAndUpdate failed', function (done) {
        var instanceService = new InstanceService()
        var mongoErr = new Error('Mongo error')
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(mongoErr)
        instanceService.updateOnContainerDie(ctx.instance, ctx.containerId, ctx.inspect, function (err) {
          expect(err.message).to.equal('Mongo error')
          done()
        })
      })
      it('should return an error if findOneAndUpdate returned nothing', function (done) {
        var instanceService = new InstanceService()
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, null)
        instanceService.updateOnContainerDie(ctx.instance, ctx.containerId, ctx.inspect, function (err) {
          expect(err.output.statusCode).to.equal(409)
          var errMsg = "Container inspect data was not updated, instance's container has changed"
          expect(err.output.payload.message).to.equal(errMsg)
          done()
        })
      })
      it('should return modified instance', function (done) {
        var instanceService = new InstanceService()
        var instance = new Instance({_id: ctx.instance._id, name: 'updated-instance'})
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, instance)
        instanceService.updateOnContainerDie(ctx.instance, ctx.containerId, ctx.inspect,
          function (err, updated) {
            expect(err).to.not.exist()
            expect(updated._id).to.equal(ctx.instance._id)
            expect(updated.name).to.equal(instance.name)
            done()
          })
      })
    })
  })

  describe('#createContainer', function () {
    beforeEach(function (done) {
      sinon.stub(InstanceService, '_findInstanceAndContextVersion')
      sinon.stub(InstanceService, '_createDockerContainer')
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      }
      ctx.mockContextVersion = {}
      ctx.mockInstance = {}
      ctx.mockContainer = {}
      ctx.mockMongoData = {
        instance: ctx.mockInstance,
        contextVersion: ctx.mockContextVersion
      }
      done()
    })
    afterEach(function (done) {
      InstanceService._findInstanceAndContextVersion.restore()
      InstanceService._createDockerContainer.restore()
      joi.validateOrBoom.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
          cb(null, data)
        })
        InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData)
        InstanceService._createDockerContainer.yieldsAsync(null, ctx.mockContainer)
        done()
      })

      it('should create a container', function (done) {
        InstanceService.createContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          // assertions
          sinon.assert.calledWith(
            joi.validateOrBoom, ctx.opts, sinon.match.object, sinon.match.func
          )
          sinon.assert.calledWith(
            InstanceService._findInstanceAndContextVersion,
            ctx.opts,
            sinon.match.func
          )
          sinon.assert.calledWith(
            InstanceService._createDockerContainer,
            sinon.match.object,
            sinon.match.func
          )
          var _createDockerContainerOpts = InstanceService._createDockerContainer.args[0][0]
          expect(_createDockerContainerOpts)
            .to.deep.contain(ctx.mockMongoData)
            .to.deep.contain(ctx.opts)
          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })
    })

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })

      describe('validateOrBoom error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom').yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })
      describe('_findInstanceAndContextVersion error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data)
          })
          InstanceService._findInstanceAndContextVersion.yieldsAsync(ctx.err)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })
      describe('_createDockerContainer error', function () {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data)
          })
          InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData)
          InstanceService._createDockerContainer.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })
    })
  })

  describe('#_findInstanceAndContextVersion', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      }
      // mock results
      ctx.mockContextVersion = {
        _id: ctx.opts.contextVersionId
      }
      ctx.mockInstance = {
        contextVersion: {
          _id: ctx.opts.contextVersionId
        }
      }
      sinon.stub(ContextVersion, 'findById')
      sinon.stub(Instance, 'findById')
      done()
    })
    afterEach(function (done) {
      ContextVersion.findById.restore()
      Instance.findById.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion)
        Instance.findById.yieldsAsync(null, ctx.mockInstance)
        done()
      })

      it('should find instance and contextVersion', function (done) {
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          if (err) { return done(err) }
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func)
          sinon.assert.calledWith(Instance.findById, ctx.opts.instanceId, sinon.match.func)
          expect(data).to.deep.equal({
            contextVersion: ctx.mockContextVersion,
            instance: ctx.mockInstance
          })
          done()
        })
      })
    })
    describe('errors', function () {
      describe('Instance not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync(null, ctx.mockInstance)
          Instance.findById.yieldsAsync()
          done()
        })

        it('should callback 404 error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(404)
            expect(err.message).to.match(/Instance/i)
            done()
          })
        })
      })

      describe('ContextVersion not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync()
          Instance.findById.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback 404 error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(404)
            expect(err.message).to.match(/ContextVersion/i)
            done()
          })
        })
      })

      describe('Instance contextVersion changed', function () {
        beforeEach(function (done) {
          ctx.mockInstance.contextVersion._id = '000011112222333344445555'
          ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion)
          Instance.findById.yieldsAsync(null, ctx.mockInstance)
          done()
        })
        it('should callback 409 error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist()
            expect(err.isBoom).to.be.true()
            expect(err.output.statusCode).to.equal(409)
            expect(err.message).to.match(/Instance.*contextVersion/i)
            done()
          })
        })
      })

      describe('ContextVersion.findById error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync(ctx.err)
          Instance.findById.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('Instance.findById error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom')
          ContextVersion.findById.yieldsAsync(ctx.err)
          Instance.findById.yieldsAsync(null, ctx.mockInstance)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done))
        })
      })
    })
  })

  describe('#_createDockerContainer', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.ownerUsername = 'runnable'
      ctx.opts = {
        contextVersion: { _id: '123456789012345678901234' },
        instance: {},
        ownerUsername: 'runnable',
        sessionUserGithubId: 10
      }
      // results
      ctx.mockContainer = {}
      sinon.stub(Mavis.prototype, 'findDockForContainer')
      sinon.stub(Docker.prototype, 'createUserContainer')
      done()
    })
    afterEach(function (done) {
      Mavis.prototype.findDockForContainer.restore()
      Docker.prototype.createUserContainer.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242')
        Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer)
        done()
      })

      it('should create a docker container', function (done) {
        InstanceService._createDockerContainer(ctx.opts, function (err, container) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Mavis.prototype.findDockForContainer,
            ctx.opts.contextVersion, sinon.match.func
          )
          var createOpts = clone(ctx.opts)
          sinon.assert.calledWith(
            Docker.prototype.createUserContainer, createOpts, sinon.match.func
          )
          expect(container).to.equal(ctx.mockContainer)
          done()
        })
      })
    })

    describe('error', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })

      describe('mavis error', function () {
        beforeEach(function (done) {
          Mavis.prototype.findDockForContainer.yieldsAsync(ctx.err)
          Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('docker error', function () {
        beforeEach(function (done) {
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242')
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer)
          done()
        })

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.err, done))
        })
      })

      describe('4XX err', function () {
        beforeEach(function (done) {
          ctx.err = Boom.notFound('Image not found')
          ctx.opts.instance = new Instance()
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242')
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer)
          done()
        })
        afterEach(function (done) {
          Instance.prototype.modifyContainerCreateErr.restore()
          done()
        })

        describe('modifyContainerCreateErr success', function () {
          beforeEach(function (done) {
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync()
            done()
          })

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.opts, function (err) {
              expect(err).to.equal(ctx.err)
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.opts.contextVersion._id,
                ctx.err,
                sinon.match.func
              )
              InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.err, done))
            })
          })
        })

        describe('modifyContainerCreateErr error', function () {
          beforeEach(function (done) {
            ctx.dbErr = new Error('boom')
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync(ctx.dbErr)
            done()
          })

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.opts, function (err) {
              expect(err).to.equal(ctx.dbErr)
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.opts.contextVersion._id,
                ctx.err,
                sinon.match.func
              )
              InstanceService._createDockerContainer(ctx.opts, expectErr(ctx.dbErr, done))
            })
          })
        })
      })
      describe('"image not found" for create err', function () {
        beforeEach(function (done) {
          ctx.err = Boom.notFound('Image not found')
          ctx.opts.instance = new Instance()
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242')
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer)
          sinon.stub(Docker, 'isImageNotFoundForCreateErr').returns(true)
          sinon.stub(InstanceService, '_handleImageNotFoundErr').yieldsAsync()
          done()
        })
        afterEach(function (done) {
          Docker.isImageNotFoundForCreateErr.restore()
          InstanceService._handleImageNotFoundErr.restore()
          done()
        })

        it('should call _handleImageNotFoundErr', function (done) {
          InstanceService._createDockerContainer(ctx.opts, function (err) {
            expect(err).to.not.exist(ctx.err)
            sinon.assert.calledWith(
              InstanceService._handleImageNotFoundErr,
              ctx.opts,
              ctx.err,
              sinon.match.func
            )
            done()
          })
        })
      })
    })
  })

  describe('#_handleImageNotFoundErr', function () {
    beforeEach(function (done) {
      sinon.stub(rabbitMQ, 'pullInstanceImage')
      ctx.opts = {
        instance: {
          _id: '23456789012345678901234',
          build: '23456789012345678901111'
        },
        sessionUserGithubId: '10',
        ownerUsername: 'ownerUsername'
      }
      done()
    })
    afterEach(function (done) {
      rabbitMQ.pullInstanceImage.restore()
      done()
    })

    it('should create a pull-instance-image job', function (done) {
      InstanceService._handleImageNotFoundErr(ctx.opts, ctx.err, function (err) {
        expect(err).to.equal(ctx.err)
        sinon.assert.calledWith(
          rabbitMQ.pullInstanceImage, {
            instanceId: ctx.opts.instance._id,
            buildId: ctx.opts.instance.build,
            sessionUserGithubId: ctx.opts.sessionUserGithubId,
            ownerUsername: ctx.opts.ownerUsername
          }
        )
        done()
      })
    })
  })

  describe('emitInstanceUpdate', function () {
    var instance

    beforeEach(function (done) {
      sinon.stub(User, 'findByGithubIdAsync').returns(Promise.resolve())
      sinon.stub(messenger, 'emitInstanceUpdateAsync')
      instance = {
        createdBy: {
          github: 123454
        },
        populateModelsAsync: sinon.stub().returns(Promise.resolve()),
        populateOwnerAndCreatedByAsync: sinon.stub().returns(Promise.resolve())
      }
      done()
    })

    afterEach(function (done) {
      User.findByGithubIdAsync.restore()
      messenger.emitInstanceUpdateAsync.restore()
      done()
    })

    it('should fail when findBygithubId fails', function (done) {
      var testErr = 'Find By GithubID Failed'
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      User.findByGithubIdAsync.returns(rejectionPromise)

      InstanceService.emitInstanceUpdate(instance, null)
        .asCallback(function (err) {
          expect(err).to.equal(testErr)
          sinon.assert.notCalled(instance.populateModelsAsync)
          sinon.assert.notCalled(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.notCalled(messenger.emitInstanceUpdateAsync)
          done()
        })
    })

    it('should use the passed in github user if one is provided', function (done) {
      var testUser = 1234
      InstanceService.emitInstanceUpdate(instance, testUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(User.findByGithubIdAsync)
          sinon.assert.calledWith(User.findByGithubIdAsync, testUser)
          done()
        })
    })

    it('should use the created by github userId if one is not passed', function (done) {
      InstanceService.emitInstanceUpdate(instance)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(User.findByGithubIdAsync)
          sinon.assert.calledWith(User.findByGithubIdAsync, instance.createdBy.github)
          done()
        })
    })

    it('should fail when populateModels fails', function (done) {
      var testErr = 'Populate Models Failed'
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      instance.populateModelsAsync.returns(rejectionPromise)

      InstanceService.emitInstanceUpdate(instance, null)
        .asCallback(function (err) {
          expect(err).to.equal(testErr)
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.notCalled(messenger.emitInstanceUpdateAsync)
          done()
        })
    })

    it('should fail when populateOwnerAndCreatedByAsync fails', function (done) {
      var testErr = 'Populate Owner Failed'
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      instance.populateOwnerAndCreatedByAsync.returns(rejectionPromise)

      InstanceService.emitInstanceUpdate(instance, null)
        .asCallback(function (err) {
          expect(err).to.equal(testErr)
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.notCalled(messenger.emitInstanceUpdateAsync)
          done()
        })
    })

    it('should pass the results of findByGithubID into populateOwnerAndCreatedByAsync', function (done) {
      var findResults = {key: 'value'}
      User.findByGithubIdAsync.returns(Promise.resolve(findResults))
      InstanceService.emitInstanceUpdate(instance, null)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.calledWith(instance.populateOwnerAndCreatedByAsync, findResults)
          done()
        })
    })

    it('should fail is the messenger fails', function (done) {
      var testErr = 'Emit Instance Update Failed'
      var rejectionPromise = Promise.reject(testErr)
      rejectionPromise.suppressUnhandledRejections()
      messenger.emitInstanceUpdateAsync.returns(rejectionPromise)

      InstanceService.emitInstanceUpdate(instance)
        .asCallback(function (err) {
          expect(err).to.equal(testErr)
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          done()
        })
    })
    it('should pass the instance into emitInstanceUpdateAsync', function (done) {
      InstanceService.emitInstanceUpdate(instance)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(messenger.emitInstanceUpdateAsync)
          sinon.assert.calledWith(messenger.emitInstanceUpdateAsync, instance)
          done()
        })
    })

    it('should pass if everything passes', function (done) {
      InstanceService.emitInstanceUpdate(instance)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(instance.populateModelsAsync)
          sinon.assert.calledOnce(instance.populateOwnerAndCreatedByAsync)
          sinon.assert.calledOnce(messenger.emitInstanceUpdateAsync)
          sinon.assert.callOrder(instance.populateModelsAsync, instance.populateOwnerAndCreatedByAsync, messenger.emitInstanceUpdateAsync)
          done()
        })
    })

  })
})
