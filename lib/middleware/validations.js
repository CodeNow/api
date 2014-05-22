'use strict';
var mw = require('dat-middleware');
var utils = require('middleware/utils');

module.exports = {
  isObjectId: function (val) {
    if (!utils.isObjectId(val)) {
      return mw.Boom.badRequest('is not an ObjectId');
    }
  },
  isObjectIdArray: function (val) {
    if (!val.every(utils.isObjectId)) {
      return mw.Boom.badRequest('is not an array of ObjectIds');
    }
  },
  isObjectId64: function (val) {
    if (!utils.isObjectId64(val)) {
      return mw.Boom.badRequest('is not an encoded ObjectId (base64)');
    }
  }
};
