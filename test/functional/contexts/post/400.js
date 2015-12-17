'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after

var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')
var typesTests = require('../../fixtures/types-test-util')

describe('400 POST /contexts', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  beforeEach(function (done) {
    ctx.user = multi.createUser(done)
  })

  describe('invalid types', function () {
    var def = {
      action: 'create a context',
      requiredParams: [
        {
          name: 'name',
          type: 'string'
        }
      ],
      optionalParams: [
        {
          name: 'isSource',
          type: 'boolean'
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
      ctx.user.createContext(body, cb)
    })
  })
})
