/**
 * @module unit/middlewares/utils
 */
'use strict'

require('loadenv')()

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

var utils = require('middlewares/utils')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('utils unit test: ' + moduleName, function () {
  describe('formatFieldFilters', function () {
    it('should set the ignored fields as an array on the req object', function (done) {
      var req = {
        query: {
          ignoredFields: 'testField'
        }
      }
      function next () {
        expect(req.ignoredFields[0]).to.equal('testField')
        done()
      }
      utils.formatFieldFilters()(req, {}, next)
    })
    it('should parse an array of options properly', function (done) {
      var req = {
        query: {
          ignoredFields: ['option 1', 'option 2']
        }
      }
      function next () {
        expect(req.ignoredFields[0]).to.equal('option 1')
        expect(req.ignoredFields[1]).to.equal('option 2')
        done()
      }
      utils.formatFieldFilters()(req, {}, next)
    })
  })
  describe('applyFieldFilters', function () {
    it('should do nothing if there are no ignored fields', function (done) {
      var req = {
        instance: {
          key: 'value'
        }
      }
      function next () {
        expect(req.instance.key).to.equal('value')
        done()
      }
      utils.applyFieldFilters('instance')(req, {}, next)
    })
    it('should ignore the ignored fields', function (done) {
      var req = {
        instance: {
          key: 'value',
          obj: {
            key: 'value'
          },
          obj1: {
            key1: 'value1'
          }
        },
        ignoredFields: ['obj.key', 'obj1.key1']
      }
      function next () {
        expect(req.instance.key).to.equal('value')
        expect(req.instance.obj).to.be.empty()
        expect(req.instance.obj1).to.be.empty()
        done()
      }
      utils.applyFieldFilters('instance')(req, {}, next)
    })
  })
})
