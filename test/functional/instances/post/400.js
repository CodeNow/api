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
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')

var typesTests = require('../../fixtures/types-test-util')

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

  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 11111,
        username: 'Runnable'
      }]
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      if (ctx.user2) {
        array.push({
          id: ctx.user2.attrs.accounts.github.id,
          username: ctx.user2.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)
  describe('invalid types', function () {
    beforeEach(function (done) {
      multi.createBuiltBuild(function (err, build, user, models, srcArray) {
        if (err) { return done(err) }
        ctx.build = build
        ctx.user = user
        ctx.cv = models[0]
        // mocks for build
        done()
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
