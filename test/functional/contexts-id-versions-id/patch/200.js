'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var it = lab.it
var after = lab.after
var Code = require('code')
var expect = Code.expect
var mongoose = require('mongoose')

var put = require('101/put')
var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')
var Instance = require('models/mongo/instance')

describe('200 PATCH /contexts/:contextid/versions/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  beforeEach(function (done) {
    multi.createContextVersion(function (err, cv) {
      if (err) { return done(err) }
      ctx.cv = cv
      done()
    })
  })

  beforeEach(function (done) {
    ctx.instance = new Instance({
      name: 'name',
      shortHash: '1234',
      owner: { github: 1234 },
      createdBy: { github: 1234 },
      build: new mongoose.Types.ObjectId(),
      created: Date.now(),
      contextVersion: ctx.cv.toJSON(),
      containers: []
    })
    ctx.instance.save(function (err) {
      done(err)
    })
  })

  afterEach(function (done) {
    ctx.instance.remove(done)
  })

  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  it('should update advanced', function (done) {
    expect(ctx.instance.contextVersion.advanced).to.be.false()
    expect(ctx.cv.json().advanced).to.be.false()
    var expected = put(ctx.cv.json(), 'advanced', true)
    ctx.cv.update({ advanced: true }, function (err, body, statusCode) {
      if (err) { return done(err) }
      expect(statusCode).to.equal(200)
      expect(body).to.deep.equal(expected)

      Instance.findById(ctx.instance.id, function (err, refreshedInstance) {
        if (err) { return done(err) }
        expect(refreshedInstance.contextVersion.advanced).to.equal(true)
        done()
      })
    })
  })

  it('should update buildDockerfilePath', function (done) {
    var expected = put(ctx.cv.json(), 'buildDockerfilePath', '/dir/Dockerfile')
    ctx.cv.update({ buildDockerfilePath: '/dir/Dockerfile' }, function (err, body, statusCode) {
      if (err) { return done(err) }
      expect(statusCode).to.equal(200)
      expect(body).to.deep.equal(expected)

      Instance.findById(ctx.instance.id, function (err, refreshedInstance) {
        if (err) { return done(err) }
        expect(refreshedInstance.contextVersion.buildDockerfilePath).to.equal('/dir/Dockerfile')
        done()
      })
    })
  })
})
