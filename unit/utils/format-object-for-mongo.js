'use strict'

var Code = require('code')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var formatObjectForMongo = require('utils/format-object-for-mongo')

describe('format-object-for-mongo unit test', function () {
  it('should format object correctly', function (done) {
    var testObject = {
      'bad.key.boo': 123,
      goodKey: 555
    }
    formatObjectForMongo(testObject)
    expect(testObject).to.deep.equal({
      'bad-key-boo': 123,
      goodKey: 555
    })
    done()
  })
  it('shouldn\'t do anything to a non-object (definitely not cause exception)', function (done) {
    var string = 'asdasdasd'
    try {
      formatObjectForMongo(string)
      done()
    } catch (e) {
      done(e)
    }
  })
  it('should format nested objects correctly', function (done) {
    var testObject = {
      'another.bad.object': {
        'bad.key.boo': 123,
        goodKey: 555,
        '.an.even.worse.object': {
          'bad.key.boo': 123,
          goodKey: 555
        }
      },
      'bad.key.boo': 123,
      goodKey: 555
    }
    formatObjectForMongo(testObject)
    expect(testObject).to.deep.equal({
      'another-bad-object': {
        'bad-key-boo': 123,
        goodKey: 555,
        '-an-even-worse-object': {
          'bad-key-boo': 123,
          goodKey: 555
        }
      },
      'bad-key-boo': 123,
      goodKey: 555
    })
    done()
  })
}) // end format-object-for-mongo unit test
