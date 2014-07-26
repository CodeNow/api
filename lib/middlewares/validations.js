'use strict';
var mw = require('dat-middleware');
var utils = require('middlewares/utils');
var keypather = require('keypather')();
var equals = require('101/equals');

module.exports = {
  isObjectId: function (val) {
    if (!utils.isObjectId(val)) {
      return mw.Boom.badRequest('is not an ObjectId');
    }
  },
  isObjectIdArray: function (val) {
    if (!Array.isArray(val) || val.length === 0 || !val.every(utils.isObjectId)) {
      return mw.Boom.badRequest('is not an array of ObjectIds');
    }
  },
  validQuerySortParams: function (field) {
    var validFields = [
      '-votes',
      'votes',
      '-created',
      'created',
      '-views',
      'views',
      '-runs',
      'runs'
    ];
    return validFields.indexOf(field) === -1 ?
      mw.Boom.badRequest('field not allowed for sorting: ' + field) :
      null;
  },
  notEquals: function (compare) {
    return function (val) {
      if (val === compare) {
        return mw.Boom.badRequest('should not be '+compare);
      }
    };
  },
  equals: function (compare) {
    return function (val) {
      if (val !== compare) {
        return mw.Boom.badRequest('should equal '+compare);
      }
    };
  },
  equalsKeypath: function (compareKey) {
    return function (val, i, vals, req) {
      var compare = keypather.get(req, compareKey);
      if (val !== compare) {
        return mw.Boom.badRequest('should equal '+compare);
      }
    };
  },
  equalsAny: function (/* comparisons */) {
    var comparisons = Array.prototype.slice.call(arguments);
    return function (val) {
      if (!comparisons.some(equals(val))) {
        return mw.Boom.badRequest('should equal one: '+comparisons.join(', '));
      }
    };
  }
};
