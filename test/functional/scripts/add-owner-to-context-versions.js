'use strict'

// we are going to test the seed script. all we have to do is shell out with the right stuff

var Code = require('code')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var after = lab.after
var before = lab.before
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var mockGetUserById = require('../fixtures/mocks/github/getByUserId')
var mongoose = require('models/mongo/mongoose-control')
require('loadenv')()

var assign = require('101/assign')
var clone = require('101/clone')
var path = require('path')
var spawn = require('child_process').spawn

var cmd = 'node'
var args = ['scripts/add-owner-to-context-versions.js']
var opts = {
  env: assign(clone(process.env), {
    'NODE_ENV': 'test',
    'ACTUALLY_RUN': true
  }),
  cwd: path.resolve(__dirname, '../../..')
}
var ContextVersion = require('models/mongo/context-version')
var Context = require('models/mongo/context')

describe('template update script', function () {
  var ctx = {}
  before(mongoose.start.bind(mongoose))
  beforeEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  after(mongoose.stop.bind(mongoose))

  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: 99999999,
        username: 'someOrg'
      }]
    })
  )
  afterEach(mockGetUserById.stubAfter)
  beforeEach(function (done) {
    ctx.c = new Context({
      name: 'test',
      owner: {
        github: 99999999
      }
    })
    ctx.c.save(done)
  })

  beforeEach(function (done) {
    ctx.cv = new ContextVersion({
      createdBy: { github: 1000 },
      context: ctx.c._id,
      owner: { github: 1111111 }
    })
    ctx.cv.save(done)
  })

  beforeEach(function (done) {
    ctx.cv.update({$unset: {owner: ''}}, done)
  })

  it('should update the templates', function (done) {
    var ps = spawn(cmd, args, opts)
    ps.on('error', done)
    ps.on('close', function (code) {
      expect(code).to.equal(0)
      ContextVersion.find({}, function (err, cvs) {
        if (err) { return done(err) }
        var cv = cvs[0]
        expect(cv.owner.github).to.equal(ctx.c.owner.github)
        done()
      })
    })
  })
})
