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
      'bad.key': 123,
      goodKey: 555
    }
    formatObjectForMongo(testObject)
    expect(testObject).to.deep.equal({
      'bad-key': 123,
      goodKey: 555
    })
    done()
  })
}) // end format-object-for-mongo unit test
