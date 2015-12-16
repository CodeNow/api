/**
 * @module test/instances-id-actions-start/put/index
 */
'use strict'

var Lab = require('lab')
var Code = require('code')

var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var exists = require('101/exists')
var sinon = require('sinon')

var expects = require('../../fixtures/expects')
var Instance = require('models/mongo/instance')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var rabbitMQ = require('models/rabbitmq/index')
var redisCleaner = require('../../fixtures/redis-cleaner')

describe('PUT /instances/:id/actions/start', function () {
  var ctx = {}

  beforeEach(redisCleaner.clean(process.env.WEAVE_NETWORKS + '*'))
  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)
  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = []
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)
  beforeEach(function (done) {
    multi.createBuiltBuild(function (err, build, user, modelsArr) {
      if (err) { return done(err) }
      ctx.build = build
      ctx.user = user
      ctx.cv = modelsArr[0]
      done()
    })
  })

  beforeEach(function (done) {
    primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
  })

  beforeEach(function (done) {
    multi.createAndTailInstance(primus, function (err, instance) {
      if (err) { return done(err) }
      ctx.instance = instance
      done()
    })
  })

  beforeEach(function (done) {
    sinon.stub(rabbitMQ.hermesClient, 'publish', function () {})
    done()
  })

  afterEach(function (done) {
    rabbitMQ.hermesClient.publish.restore()
    done()
  })

  it('should error if instance not found', function (done) {
    Instance.findOneAndRemove({
      '_id': ctx.instance.attrs._id
    }, {}, function (err) {
      if (err) { throw err }
      ctx.instance.start(function (err) {
        expect(err.data.message).to.equal('Instance not found')
        expect(err.data.statusCode).to.equal(404)
        done()
      })
    })
  })

  it('should error if instance does not have a container', function (done) {
    Instance.findOneAndUpdate({
      '_id': ctx.instance.attrs._id
    }, {
      '$unset': {
        container: 1
      }
    }, function (err) {
      if (err) { throw err }
      ctx.instance.start(function (err) {
        expect(err.message).to.equal('Instance does not have a container')
        expect(err.output.statusCode).to.equal(400)
        done()
      })
    })
  })

  it('should return error if container is already starting and NOT place task in queue', function (done) {
    Instance.findOneAndUpdate({
      '_id': ctx.instance.attrs._id
    }, {
      '$set': {
        'container.inspect.State.Starting': true
      }
    }, function (err) {
      if (err) { throw err }
      ctx.instance.start(function (err) {
        expect(err.message).to.equal('Instance is already starting')
        expect(err.output.statusCode).to.equal(400)
        expect(rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })

  it('should place a task in the "start-instance-container" queue', function (done) {
    ctx.instance.start(function (err) {
      expect(err).to.be.null()
      expect(rabbitMQ.hermesClient.publish.callCount).to.equal(1)
      expect(rabbitMQ.hermesClient.publish.args[0][0]).to.equal('start-instance-container')
      expect(rabbitMQ.hermesClient.publish.args[0][1]).to.include({
        dockerContainer: ctx.instance.attrs.container.dockerContainer,
        dockerHost: ctx.instance.attrs.container.dockerHost,
        instanceId: ctx.instance.attrs._id,
        ownerUsername: ctx.instance.user.attrs.accounts.github.login,
        sessionUserGithubId: ctx.instance.user.attrs.accounts.github.id
      })
      // tix uuid set server side
      expect(rabbitMQ.hermesClient.publish.args[0][1].tid).to.be.a.string()
      expect(rabbitMQ.hermesClient.publish.args[0][1].tid)
        .to.match(/^[A-z0-9]{8}-[A-z0-9]{4}-[A-z0-9]{4}-[A-z0-9]{4}-[A-z0-9]{12}$/)
      done()
    })
  })

  it('should return instance if request successfull', function (done) {
    ctx.instance.start(expects.success(200, {
      _id: exists,
      shortHash: exists,
      'createdBy.github': ctx.instance.user.attrs.accounts.github.id,
      name: exists,
      owner: {
        username: ctx.instance.user.attrs.accounts.github.login,
        gravatar: ctx.instance.user.attrs.gravatar,
        github: ctx.instance.user.attrs.accounts.github.id
      },
      contextVersions: exists
    }, done))
  })
})
