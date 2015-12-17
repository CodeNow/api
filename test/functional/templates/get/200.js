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

var api = require('../../fixtures/api-control')
var multi = require('../../fixtures/multi-factory')

var Template = require('models/mongo/template')

describe('GET /templates', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  describe('GET', function () {
    beforeEach(function (done) {
      ctx.user = multi.createUser(done)
    })

    describe('no templates', function () {
      it('should return all the templates available (none)', function (done) {
        ctx.user.fetchTemplates(function (err, docs) {
          if (err) { return done(err) }
          expect(docs).to.have.length(0)
          done()
        })
      })
    })

    describe('some templates', function () {
      beforeEach(function (done) {
        ctx.template = new Template({
          name: 'Nodejs',
          from: 'nodeJs',
          ports: [8080],
          generalCommands: ['apt-get update'],
          cmd: 'sleep 10'
        })
        ctx.template.save(done)
      })

      it('should return all the templates available', function (done) {
        ctx.user.fetchTemplates(function (err, docs) {
          if (err) { return done(err) }
          expect(docs).to.have.length(1)
          expect(docs[0].lowerName).to.equal('nodejs')
          expect(Date.parse(docs[0].created)).to.be.about(Date.now(), 5000)
          expect(Date.parse(docs[0].updated)).to.be.about(Date.now(), 5000)
          done()
        })
      })

      it('should update the updated time when model is updated', function (done) {
        ctx.user.fetchTemplates(function (err, docs) {
          if (err) { return done(err) }
          ctx.template.cmd = 'node server.js'
          var savedTime = docs[0].updated
          ctx.template.save(function (saveErr) {
            if (saveErr) { return done(saveErr) }
            ctx.user.fetchTemplates(function (fetchErr, updatedDocs) {
              if (fetchErr) { return done(fetchErr) }
              expect(updatedDocs).to.have.length(1)
              expect(savedTime).to.not.equal(updatedDocs[0].updated)
              expect(updatedDocs[0].cmd).to.equal('node server.js')
              done()
            })
          })
        })
      })

      describe('deleted template', function () {
        beforeEach(function (done) {
          ctx.template.deleted = true
          ctx.template.save(done)
        })

        it('should not return any docs', function (done) {
          ctx.user.fetchTemplates(function (err, docs) {
            if (err) { return done(err) }
            expect(docs).to.have.length(0)
            done()
          })
        })
      })
    })
  })
})
