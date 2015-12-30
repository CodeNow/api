/**
 * @module unit/logger
 */
'use strict'

var Lab = require('lab')
var Code = require('code')
var domain = require('domain')

var lab = exports.lab = Lab.script()

var describe = lab.describe
var expect = Code.expect
var it = lab.test

var clone = require('101/clone')
var keypath = require('keypather')()

var logger = require('logger')

describe('lib/logger.js unit test', function () {
  describe('serializers', function () {
    describe('tx', function () {
      it('should use data from domain', function (done) {
        var d = domain.create()
        d.runnableData = {
          foo: 'bar'
        }
        d.run(function () {
          var serialized = logger._serializers.tx()
          expect(serialized.txTimestamp).to.be.an.instanceOf(Date)
          expect(serialized.foo).to.equal('bar')
          done()
        })
      })

      it('should use existing domain.reqStart', function (done) {
        var d = domain.create()
        d.runnableData = {
          reqStart: new Date()
        }
        d.run(function () {
          var serialized = logger._serializers.tx()
          expect(serialized.txTimestamp).to.be.an.instanceOf(Date)
          expect(serialized.txMSFromReqStart).to.be.a.number()
          done()
        })
      })

      // log delta -- milliseconds since previous log message
      it('should use previous txTimestamp to derrive log time delta', function (done) {
        var d = domain.create()
        d.runnableData = {
          reqStart: new Date(),
          txTimestamp: new Date(new Date() - 1000000)
        }
        d.run(function () {
          var serialized = logger._serializers.tx()
          expect(serialized.txTimestamp).to.be.an.instanceOf(Date)
          expect(serialized.txMSFromReqStart).to.be.a.number()
          // note(tj): js cannot be relied on to calculate timestamp differences w/ ms accuracy
          // gave it a second offset in case the ci service is going slow:
          expect(serialized.txMSDelta).to.about(1000000, 200)
          done()
        })
      })

      it('should work when domain.runnableData not defined', function (done) {
        var serialized = logger._serializers.tx()
        expect(serialized.txTimestamp).to.be.an.instanceOf(Date)
        done()
      })
    })

    describe('req', function () {
      it('should parse keys from req object', function (done) {
        var serialized = logger._serializers.req({
          method: 'GET',
          url: 'some-url',
          isInternalRequest: true
        })
        expect(serialized.method).to.equal('GET')
        expect(serialized.url).to.equal('some-url')
        expect(serialized.isInternalRequest).to.equal(true)
        done()
      })
    })
  })
  describe('_removeExtraKeys', function () {
    it('should remove nothing', function (done) {
      var testObj = {
        do: 'not',
        remove: ['me'],
        insta: 'instance',
        cat: 'key'
      }
      var out = logger._removeExtraKeys(testObj)
      expect(out).to.deep.equal(testObj)
      done()
    })

    it('should remove extra keys', function (done) {
      var testObj = {
        keep: 'me',
        build: {
          keep: 'me'
        },
        instance: {
          contextVersion: {
            keep: {
              keep: 'me'
            },
            build: {
              keep: 'me'
            }
          },
          contextVersions: [{
            keep: {
              keep: 'me'
            },
            build: {
              keep: 'me'
            }
          }],
          keep: 'me'
        },
        contextVersion: {
          keep: {
            keep: 'me'
          },
          build: {
            keep: 'me'
          }
        },
        contextVersions: [{
          keep: {
            keep: 'me'
          },
          build: {
            keep: 'me'
          }
        }]
      }
      var inputData = clone(testObj)
      keypath.set(inputData, 'instance.contextVersion.build.log', 'bad')
      keypath.set(inputData, 'instance.contextVersions[0].build.log', 'bad')
      keypath.set(inputData, 'contextVersion.build.log', 'bad')
      keypath.set(inputData, 'contextVersions[0].build.log', 'bad')
      keypath.set(inputData, 'build.log', 'bad')
      keypath.set(inputData, 'ca', 'bad')
      keypath.set(inputData, 'cert', 'bad')
      keypath.set(inputData, 'key', 'bad')
      var out = logger._removeExtraKeys(inputData)
      expect(out).to.deep.equal(testObj)
      done()
    })
  }) // end _removeExtraKeys
})
