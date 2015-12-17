'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('./fixtures/api-control')
var multi = require('./fixtures/multi-factory')
var expects = require('./fixtures/expects')
var exists = require('101/exists')
var randStr = require('randomstring').generate

describe('Context - /contexts', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  beforeEach(function (done) {
    ctx.user = multi.createUser(done)
  })

  var required = {
    name: randStr(5)
  }
  it('should create a context with a name', function (done) {
    var expected = {
      name: required.name,
      lowerName: required.name.toLowerCase(),
      created: exists,
      'owner.github': ctx.user.attrs.accounts.github.id
    }
    ctx.user.createContext(required, expects.success(201, expected, done))
  })
  it('should not create a context if missing name', function (done) {
    ctx.user.createContext({}, expects.error(400, /name/, done))
  })
})
