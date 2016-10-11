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
var clock

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
                sslCA: [ 'cacert' ],
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

    describe('handling mongodb disconnect events', function () {
      beforeEach(function (done) {
        sinon.stub(mongoose.connection, 'on').yields()
        sinon.stub(process, 'exit')
        sinon.stub(mongooseControl, '_exitIfFailedToReconnect')
        sinon.stub(mongooseControl, '_exitIfFailedToOpen')
        done()
      })

      afterEach(function (done) {
        mongooseControl._exitIfFailedToReconnect.restore()
        mongooseControl._exitIfFailedToOpen.restore()
        mongoose.connection.on.restore()
        process.exit.restore()
        done()
      })

      it('should exit if it cannot connect', function (done) {
        mongooseControl.start(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(mongooseControl._exitIfFailedToReconnect)
          sinon.assert.calledOnce(mongooseControl._exitIfFailedToOpen)
          done()
        })
      })

      it('should attempt a retry if connection existed', function (done) {
        mongoose.connection._hasOpened = true
        mongooseControl.start(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(mongooseControl._exitIfFailedToOpen)
          sinon.assert.calledOnce(mongooseControl._exitIfFailedToReconnect)
          done()
        })
      })
    })

    describe('exiting node process when db disconnects', function () {
      beforeEach(function (done) {
        clock = sinon.useFakeTimers()
        sinon.stub(mongoose.connection, 'on').yields()
        sinon.stub(process, 'exit')
        done()
      })

      afterEach(function (done) {
        mongoose.connection.on.restore()
        process.exit.restore()
        clock.restore()
        done()
      })

      it('should exit immediately if it cannot connect', function (done) {
        mongooseControl._exitIfFailedToOpen()
        sinon.assert.calledOnce(process.exit)
        done()
      })

      it('should attempt to reconnect when it was connected once', function (done) {
        mongooseControl._exitIfFailedToReconnect()
        clock.tick(1000)
        sinon.assert.notCalled(process.exit)
        clock.tick(10000)
        sinon.assert.calledOnce(process.exit)
        done()
      })
    })
  })
})
