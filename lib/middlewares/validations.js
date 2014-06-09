'use strict';
var mw = require('dat-middleware');
var exists = require('101/exists');
var isObject = require('101/is-object');
var utils = require('middlewares/utils');

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
  },
  notEmpty: function (val) {
    if (isObject(val)) {
      val = Object.keys(val);
    }
    if (exists(val.length) && val.length === 0) {
      return mw.Boom.badRequest('is empty');
    }
  }
};
