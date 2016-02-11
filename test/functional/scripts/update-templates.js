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
var Template = require('models/mongo/template')
require('loadenv')()

var assign = require('101/assign')
var clone = require('101/clone')
var find = require('101/find')
var fs = require('fs')
var hasProps = require('101/has-properties')
var path = require('path')
var spawn = require('child_process').spawn

var cmd = 'node'
var args = ['scripts/templates/update-templates.js']
var opts = {
  env: assign(clone(process.env), {
    'NODE_ENV': 'test',
    'ACTUALLY_RUN': true
  }),
  cwd: path.resolve(__dirname, '../../..')
}

describe('template update script', function () {
  var ctx = {}
  before(mongoose.start.bind(mongoose))
  beforeEach(require('../fixtures/clean-mongo').removeEverything)
  afterEach(require('../fixtures/clean-mongo').removeEverything)
  after(mongoose.stop.bind(mongoose))
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  afterEach(mockGetUserById.stubAfter)

  beforeEach(function (done) {
    var nodejsData = require(path.resolve(__dirname, '../../../scripts/templates/nodejs.json'))
    // a field to see updated
    nodejsData.defaultMainCommands.push('# remove this')
    // a field to see cleared
    nodejsData.cmd = 'node server.js'
    // this is set in the script from the filename, so we do it here
    nodejsData.name = 'nodejs'
    var nodejs = new Template(nodejsData)
    nodejs.save(done)
  })

  beforeEach(function (done) {
    fs.readdir(path.resolve(__dirname, '../../../scripts/templates'), function (err, files) {
      if (err) { return done(err) }
      ctx.templateCount = files.filter(function (n) {
        return /.+\.json$/.test(n)
      }).filter(require('101/exists')).length
      done()
    })
  })

  it('should update the templates', function (done) {
    var ps = spawn(cmd, args, opts)
    ps.on('error', done)
    ps.on('close', function (code) {
      expect(code).to.equal(0)
      Template.find({}, function (err, docs) {
        if (err) { return done(err) }
        expect(docs).to.have.length(ctx.templateCount)
        var doc = find(docs, hasProps({ lowerName: 'nodejs' }))
        expect(doc).to.exist()
        expect(doc.cmd).to.equal('')
        expect(doc.defaultMainCommands).to.have.length(1)
        expect(doc.defaultMainCommands).to.deep.equal(['npm install'])
        done()
      })
    })
  })
})
