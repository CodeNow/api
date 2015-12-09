/**
 * @module test/instances-id-actions-redeploy/post/index
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
var Build = require('models/mongo/build')
var Instance = require('models/mongo/instance')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')
var rabbitMQ = require('models/rabbitmq/index')
var redisCleaner = require('../../fixtures/redis-cleaner')

describe('POST /instances/:id/actions/redeploy', function () {
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
      ctx.instance.redeploy(function (err) {
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
      ctx.instance.redeploy(function (err) {
        expect(err.message).to.equal('Cannot redeploy an instance without a container')
        expect(err.output.statusCode).to.equal(400)
        done()
      })
    })
  })

  it('should return error if build was not successful', function (done) {
    console.log('aaaaa', ctx.instance.attrs)
    Build.findOneAndUpdate({
      '_id': ctx.instance.attrs.build._id
    }, {
      '$set': {
        'completed': null
      }
    }, function (err, build) {
      if (err) { return done(err) }
      ctx.instance.redeploy(function (err) {
        expect(err.message).to.equal('Cannot redeploy an instance with an unsuccessful build')
        expect(err.output.statusCode).to.equal(400)
        expect(rabbitMQ.hermesClient.publish.callCount).to.equal(0)
        done()
      })
    })
  })

  it('should place a task in the "instance.container.redeploy" queue', function (done) {
    ctx.instance.redeploy(function (err) {
      expect(err).to.be.null()
      expect(rabbitMQ.hermesClient.publish.callCount).to.equal(1)
      expect(rabbitMQ.hermesClient.publish.args[0][0]).to.equal('instance.container.redeploy')
      var job = rabbitMQ.hermesClient.publish.args[0][1]
      expect(job.instanceId.toString()).to.equal(ctx.instance.attrs._id.toString())
      expect(job.sessionUserGithubId).to.equal(ctx.instance.user.attrs.accounts.github.id)
      done()
    })
  })

  it('should return instance if request successfull', function (done) {
    ctx.instance.redeploy(expects.success(200, {
      _id: exists,
      shortHash: exists,
      'createdBy.github': ctx.instance.user.attrs.accounts.github.id,
      name: exists
    }, done))
  })
})
