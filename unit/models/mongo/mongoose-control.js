'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var Code = require('code')
var fs = require('fs')
var mongoose = require('mongoose')
var sinon = require('sinon')

var mongooseControl = require('models/mongo/mongoose-control')

var expect = Code.expect

describe('mongoose-control', function () {
  describe('start', function () {
    var prevCACert = process.env.MONGO_CACERT
    var prevCert = process.env.MONGO_CERT
    var prevKey = process.env.MONGO_KEY

    beforeEach(function (done) {
      delete process.env.MONGO_CACERT
      delete process.env.MONGO_CERT
      delete process.env.MONGO_KEY
      sinon.stub(fs, 'readFileSync').returnsArg(0)
      sinon.stub(mongoose, 'connect').yieldsAsync()
      done()
    })

    afterEach(function (done) {
      process.env.MONGO_CACERT = prevCACert
      process.env.MONGO_CERT = prevCert
      process.env.MONGO_KEY = prevKey
      fs.readFileSync.restore()
      mongoose.connect.restore()
      done()
    })

    describe('with certificates', function () {
      beforeEach(function (done) {
        process.env.MONGO_CACERT = 'cacert'
        process.env.MONGO_CERT = 'cert'
        process.env.MONGO_KEY = 'key'
        done()
      })

      it('should read the certificates', function (done) {
        mongooseControl.start(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledThrice(fs.readFileSync)
          sinon.assert.calledWith(fs.readFileSync, 'cacert')
          sinon.assert.calledWith(fs.readFileSync, 'cert')
          sinon.assert.calledWith(fs.readFileSync, 'key')
          done()
        })
      })

      it('should connect with certificate information', function (done) {
        mongooseControl.start(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mongoose.connect)
          sinon.assert.calledWithExactly(
            mongoose.connect,
            sinon.match.string,
            {
              server: {
                ssl: true,
                sslValidate: true,
                sslCA: 'cacert',
                sslCert: 'cert',
                sslKey: 'key'
              }
            },
            sinon.match.func
          )
          done()
        })
      })
    })

    it('should not read certs by default', function (done) {
      mongooseControl.start(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(fs.readFileSync)
        done()
      })
    })

    it('should not add certificates', function (done) {
      mongooseControl.start(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mongoose.connect)
        sinon.assert.calledWithExactly(
          mongoose.connect,
          sinon.match.string,
          {},
          sinon.match.func
        )
        done()
      })
    })
  })
})
