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
var primus = require('../../fixtures/primus')
var dockerMockEvents = require('../../fixtures/docker-mock-events')

var typesTests = require('../../fixtures/types-test-util')
var uuid = require('uuid')

describe('400 POST /instances', function () {
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
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        if (err) { return done(err) }
        ctx.build = build
        ctx.user = user
        ctx.cv = contextVersion
        // mocks for build
        done()
      })
    })
    beforeEach(function (done) {
      primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
    })
    beforeEach(function (done) {
      ctx.build.build({ message: uuid() }, function (err) {
        if (err) { return done(err) }
        primus.onceVersionComplete(ctx.cv.id(), function (/* data */) {
          done()
        })
        dockerMockEvents.emitBuildComplete(ctx.cv)
      })
    })

    var def = {
      action: 'create an instance',
      requiredParams: [
        {
          name: 'build',
          type: 'ObjectId'
        }
      ],
      optionalParams: [
        {
          name: 'parent',
          type: 'string'
        },
        {
          name: 'env',
          type: 'array',
          itemType: 'string',
          itemRegExp: /^([A-z]+[A-z0-9_]*)=.*$/,
          itemValues: [
            'string1',
            '1=X',
            'a!=x'
          ]
        },
        {
          name: 'name',
          type: 'string',
          invalidValues: [
            'has!',
            'has.x2'
          ]
        },
        {
          name: 'owner',
          type: 'object',
          keys: [
            {
              name: 'github',
              type: 'number'
            }
          ]
        }
      ]
    }

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      ctx.user.createInstance(body, cb)
    })
  })
})
