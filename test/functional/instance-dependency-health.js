'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var api = require('./fixtures/api-control')
var primus = require('./fixtures/primus')

var request = require('request')

describe('GET /dependencies/actions/health', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))

  before(function (done) {
    var Neo4j = require('runna4j')
    var client = new Neo4j()
    var err
    client.cypher('MATCH (n) OPTIONAL MATCH (n)-[r]-() DELETE n, r')
      .on('error', function (e) { err = e })
      .on('end', function () { done(err) })
      .on('data', function () {})
  })

  it('should tell us how many instances are in the graph', function (done) {
    request.get(process.env.FULL_API_DOMAIN + '/dependencies/actions/health', function (err, res, body) {
      expect(err).to.be.null()
      expect(body).to.equal('0')

      done(err)
    })
  })
})
