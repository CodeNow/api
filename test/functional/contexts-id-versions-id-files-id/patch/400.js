'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after

var find = require('101/find')
var hasKeypaths = require('101/has-keypaths')

var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')

var typesTests = require('../../fixtures/types-test-util')

describe('400 PATCH /contexts/:contextid/versions/:id/files/:id', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(api.stop.bind(ctx))
  after(require('../../fixtures/mocks/api-client').clean)

  var dirPathName = 'dir[]()'

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, env, project, user) {
      if (err) { return done(err) }
      ctx.build = build
      ctx.user = user
      ctx.contextVersion = contextVersion
      ctx.context = context
      require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      ctx.files = ctx.contextVersion.rootDir.contents
      ctx.files.fetch({ path: '/' }, function (err) {
        if (err) { return done(err) }
        ctx.file = ctx.files.models[0]
        ctx.fileId = ctx.file.id()
        ctx.dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }))
        require('../../fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        require('../../fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName + '/')
        ctx.dir = ctx.files.createDir(dirPathName, done)
      })
    })
  })

  describe('invalid types', function () {
    var def = {
      action: 'update file',
      optionalParams: [
        {
          name: 'body',
          type: 'string'
        },
        {
          name: 'name',
          type: 'string'
        },
        {
          name: 'path',
          type: 'string'
        }
      ]
    }

    typesTests.makeTestFromDef(def, ctx, lab, function (body, cb) {
      var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }))
      dockerfile.update({json: body}, cb)
    })
  })
})
