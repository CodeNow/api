'use strict'

var Code = require('code')
var Lab = require('lab')
var sinon = require('sinon')

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect

var toJSON = require('utils/to-json')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('to-json: ' + moduleName, function () {
  it('should convert to json', function (done) {
    var expected = {}
    var val = {
      toJSON: sinon.stub().returns(expected)
    }
    var ret = toJSON(val)
    sinon.assert.calledOnce(val.toJSON)
    expect(ret).to.equal(expected)
    done()
  })

  it('should not json if no toJSON', function (done) {
    var val = {}
    var ret = toJSON(val)
    expect(ret).to.equal(val)
    done()
  })
})
