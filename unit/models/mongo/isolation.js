'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var joi = require('utils/joi')

var Isolation = require('models/mongo/isolation')

describe('Isolation Model', function () {
  describe('#_validateCreateData', function () {
    var data

    beforeEach(function (done) {
      data = {
        master: 'deadbeefdeadbeefdeadbeef',
        children: [
          { instance: 'deefdeadbeefdeadbeefdead' },
          { org: 'foo', repo: 'bar', branch: 'baz' }
        ]
      }
      sinon.spy(joi, 'validate')
      done()
    })

    afterEach(function (done) {
      joi.validate.restore()
      done()
    })

    describe('(boom) errors', function () {
      it('should require data', function (done) {
        Isolation._validateCreateData().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/data.+required/)
          done()
        })
      })

      it('should require master', function (done) {
        delete data.master
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/master.+required/)
          done()
        })
      })

      it('should require children', function (done) {
        delete data.children
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+required/)
          done()
        })
      })

      it('should require children to be well formed (instance w/ extra key)', function (done) {
        data.children.pop() // remove the org, repo, branch version
        data.children[0].foo = 'bar'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require children to be well formed (instance w/o object id)', function (done) {
        data.children.pop() // remove the org, repo, branch version
        data.children[0].instance = '4'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require children to be well formed (repo w/ extra key)', function (done) {
        data.children.shift() // remove the instance version
        data.children[0].foo = 'bar'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require children to be well formed (repo w/o some key)', function (done) {
        data.children.shift() // remove the instance version
        delete data.children[0].repo
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+not.+match.+allowed.+types/i)
          done()
        })
      })

      it('should require all children to be well formed (one good)', function (done) {
        data.children[0].foo = 'bar'
        Isolation._validateCreateData(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.isBoom).to.be.true()
          expect(err.message).to.match(/children.+0.+not.+match.+allowed.+types/i)
          done()
        })
      })
    })

    it('should validate arguments', function (done) {
      Isolation._validateCreateData(data).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(joi.validate)
        sinon.assert.calledWith(joi.validate, data)
        done()
      })
    })
  })

  describe('#createIsolation', function () {
    var data

    beforeEach(function (done) {
      data = {}
      sinon.stub(Isolation, '_validateCreateData').resolves()
      done()
    })

    afterEach(function (done) {
      Isolation._validateCreateData.restore()
      done()
    })

    describe('validation', function () {
      it('should validate the data', function (done) {
        Isolation.createIsolation(data).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation._validateCreateData)
          sinon.assert.calledWithExactly(
            Isolation._validateCreateData,
            data
          )
          done()
        })
      })

      it('should reject with error when validation fails', function (done) {
        var error = new Error('foo')
        Isolation._validateCreateData.rejects(error)
        Isolation.createIsolation(data).asCallback(function (err) {
          expect(err).to.equal(error)
          done()
        })
      })
    })
  })
})
