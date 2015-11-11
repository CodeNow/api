'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var multi = require('../../fixtures/multi-factory')
var typesTests = require('../../fixtures/types-test-util')
var primus = require('../../fixtures/primus')
var noop = require('101/noop')

describe('PATCH 400 - /instances/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createAndTailInstance(primus, function (err, instance) {
        if (err) { return done(err) }
        ctx.instance = instance
        done()
      })
    })

    var def = {
      action: 'update an instance',
      optionalParams: [
        {
          name: 'build',
          type: 'ObjectId'
        },
        {
          name: 'public',
          type: 'boolean'
        },
        {
          name: 'locked',
          type: 'boolean'
        },
        {
          name: 'env',
          type: 'array',
          itemType: 'string',
          itemRegExp: /^([A-z]+[A-z0-9_]*)=.*$/,
          invalidValues: [
            'string1',
            '1=X',
            'a!=x'
          ]
        }
      ]
    }

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.instance.setupChildren = noop // setup children causes model id warning spam
      ctx.instance.update(body, cb)
    })
  })
})
