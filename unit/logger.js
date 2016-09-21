/**
 * @module unit/logger
 */
'use strict'

var clone = require('101/clone')
var cls = require('continuation-local-storage')
var Code = require('code')
var domain = require('domain')
var keypath = require('keypather')()
var Lab = require('lab')
var sinon = require('sinon')

var _removeExtraKeys = require('logger/serializer-extra-keys')._removeExtraKeys
var logger = require('logger')
var removeEnvsAtPropertyPath = require('logger/serializer-env').removeEnvsAtPropertyPath

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.test

describe('lib/logger.js unit test', function () {
  describe('serializers', function () {
    describe('tx', function () {
      describe('domain', function () {
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
      }) // end domain

      describe('cls', function () {
        var ns
        beforeEach(function (done) {
          ns = cls.createNamespace('ponos')

          done()
        })

        afterEach(function (done) {
          cls.destroyNamespace('ponos')
          done()
        })

        it('should return tid', function (done) {
          var testTid = '123-123-123'
          ns.run(function () {
            ns.set('tid', testTid)
            var serialized = logger._serializers.tx()
            expect(serialized).to.equal({
              tid: testTid
            })
            done()
          })
        })

        it('should return undefined if no tid', function (done) {
          ns.run(function () {
            var serialized = logger._serializers.tx()
            expect(serialized).to.be.undefined()
            done()
          })
        })
      }) // end cls

      describe('undefined', function () {
        it('should work when domain.runnableData not defined', function (done) {
          var serialized = logger._serializers.tx()
          expect(serialized).to.be.undefined()
          done()
        })
      }) // end undefined
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
    it('should remove nothing', function (done) {
      var testObj = {
        do: 'not',
        remove: ['me'],
        insta: 'instance',
        cat: 'key'
      }
      var out = _removeExtraKeys(testObj)
      expect(out).to.equal(testObj)
      done()
    })

    it('should remove extra keys', function (done) {
      var inputData = clone(testObj)
      keypath.set(inputData, 'instance.contextVersion.build.log', 'bad')
      keypath.set(inputData, 'instance.contextVersions[0].build.log', 'bad')
      keypath.set(inputData, 'contextVersion.build.log', 'bad')
      keypath.set(inputData, 'contextVersions[0].build.log', 'bad')
      keypath.set(inputData, 'build.log', 'bad')
      keypath.set(inputData, 'ca', 'bad')
      keypath.set(inputData, 'cert', 'bad')
      keypath.set(inputData, 'key', 'bad')
      var out = _removeExtraKeys(inputData)
      expect(out).to.equal(testObj)
      done()
    })

    it('should toJSON and remove extra keys', function (done) {
      var inputData = {
        toJSON: function () {
          return clone(testObj)
        }
      }
      keypath.set(inputData, 'instance.contextVersion.build.log', 'bad')
      keypath.set(inputData, 'instance.contextVersions[0].build.log', 'bad')
      keypath.set(inputData, 'contextVersion.build.log', 'bad')
      keypath.set(inputData, 'contextVersions[0].build.log', 'bad')
      keypath.set(inputData, 'build.log', 'bad')
      keypath.set(inputData, 'ca', 'bad')
      keypath.set(inputData, 'cert', 'bad')
      keypath.set(inputData, 'key', 'bad')
      var out = _removeExtraKeys(inputData)
      expect(out).to.equal(testObj)
      done()
    })

    it('should toJSON first-level-subdocuments and remove extra keys', function (done) {
      function toJSON () {
        return {
          data: {
            owner: {
              github: 234234234,
              username: 'nathan219',
              gravatar: 'testingtesting123'
            },
            createdBy: {
              github: 234234234,
              username: 'nathan219',
              gravatar: 'testingtesting123'
            }
          }
        }
      }
      var helloFn = sinon.stub()
      var inputData = {
        data: {
          owner: {
            github: 234234234,
            username: 'nathan219',
            gravatar: 'testingtesting123',
            hello: helloFn
          },
          createdBy: {
            github: 234234234,
            username: 'nathan219',
            gravatar: 'testingtesting123'
          },
          toJSON: toJSON
        }
      }
      var out = _removeExtraKeys(inputData)
      expect(out).to.equal({
        data: {
          data: {
            owner: {
              github: 234234234,
              username: 'nathan219',
              gravatar: 'testingtesting123'
            },
            createdBy: {
              github: 234234234,
              username: 'nathan219',
              gravatar: 'testingtesting123'
            }
          }
        }
      })
      // Make sure the original object wasn't modified
      expect(inputData).to.equal({
        data: {
          owner: {
            github: 234234234,
            username: 'nathan219',
            gravatar: 'testingtesting123',
            hello: helloFn
          },
          createdBy: {
            github: 234234234,
            username: 'nathan219',
            gravatar: 'testingtesting123'
          },
          toJSON: toJSON
        }
      })
      done()
    })
  }) // end _removeExtraKeys
  describe('removeEnvsAtPropertyPath', function () {
    it('should remove envs in a property', function (done) {
      var originalObj = {
        instance: {
          env: [
            'RUNNABLE_ID=1',
            'SECRET_KEY=2'
          ]
        }
      }
      var obj = removeEnvsAtPropertyPath(['instance'])(originalObj)
      expect(obj.instance.env).to.equal([ 'RUNNABLE_ID=1' ])
      done()
    })

    it('should remove envs in a property when uppercase', function (done) {
      var originalObj = {
        instance: {
          ENV: [
            'RUNNABLE_ID=1',
            'SECRET_KEY=2'
          ]
        }
      }
      var obj = removeEnvsAtPropertyPath(['instance'])(originalObj)
      expect(obj.instance.ENV).to.equal([ 'RUNNABLE_ID=1' ])
      done()
    })

    it('should remove envs at the top level', function (done) {
      var originalObj = {
        Env: [
          'RUNNABLE_ID=1',
          'SECRET_KEY=2'
        ]
      }
      var obj = removeEnvsAtPropertyPath([''])(originalObj)
      expect(obj.Env).to.equal([ 'RUNNABLE_ID=1' ])
      done()
    })
  })
})
