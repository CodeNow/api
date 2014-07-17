'use strict';
var mw = require('dat-middleware');
var utils = require('middlewares/utils');

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
        return mw.Boom.badRequest('should not be '+compare);
      }
    };
  }
};
