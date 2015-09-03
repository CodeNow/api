/**
 * @module unit/middlewares/utils
 */
'use strict';

require('loadenv')();

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var utils = require('middlewares/utils');

describe('utils unit test', function () {
  describe('formatFieldFilters', function () {
    it('should set the ignored fields as an array on the req object', function (done) {
      var req = {
        query: {
          ignoredFields: '"testField"'
        }
      };
      var res = {};
      function next() {
        expect(req.ignoredFields[0]).to.equal('testField');
        done();
      }
      utils.formatFieldFilters()(req, res, next);
    });
    it('should handle and JSON parse errors like a champ', function (done) {
      var req = {
        query: {
          ignoredFields: '[thisisInvalidJSON'
        }
      };
      var res = {};
      function next() {
        expect(req.ignoredFields).to.not.exist();
        done();
      }
      utils.formatFieldFilters()(req, res, next);
    });
    it('should parse an array of options properly', function (done) {
      var req = {
        query: {
          ignoredFields: '["option 1", "option 2"]'
        }
      };
      var res = {};
      function next() {
        expect(req.ignoredFields[0]).to.equal('option 1');
        done();
      }
      utils.formatFieldFilters()(req, res, next);
    });
  });
  describe('applyFieldFilters', function () {
    it('should do nothing if there are no ignored fields', function (done) {
      var req = {
        instance: {
          key: 'value'
        }
      };
      var res = {};
      function next() {
        expect(req.instance.key).to.equal('value');
        done();
      }
      utils.applyFieldFilters('instance')(req, res, next);
    });
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
      };
      var res = {};
      function next() {
        expect(req.instance.key).to.equal('value');
        expect(req.instance.obj).to.be.empty();
        expect(req.instance.obj1).to.be.empty();
        done();
      }
      utils.applyFieldFilters('instance')(req, res, next);
    });
  });
});
