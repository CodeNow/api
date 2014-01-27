var _ = require('lodash');
var async = require('async');
var error = require('error');
var mongoose = require('mongoose');
var BaseSchema = require('models/BaseSchema');
var users = require('models/users');
var images = require('models/images');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var SpecificationSchema = new Schema({
  owner: { type: ObjectId },
  name: {
    type: String,
    index: true,
    unique: true
  },
  description: { type: String },
  instructions: { type: String },
  requirements: {
    type: [String],
    'default': []
  }
});
// SpecificationSchema.set('autoIndex', false);
_.extend(SpecificationSchema.methods, BaseSchema.methods);
_.extend(SpecificationSchema.statics, BaseSchema.statics);

SpecificationSchema.statics.getVirtuals = function (domain, spec, cb) {
  var json = spec.toJSON();
  var specId = json._id;
  var owner = json.owner;
  async.parallel([
    function (cb) {
      images.findOne({ specification: specId }, { _id: 1 }, domain.intercept(function (image) {
        cb(null, Boolean(image));
      }));
    },
    function (cb) {
      images.findOne({
        specification: specId,
        owner: { $ne: owner }
      }, { _id: 1 }, domain.intercept(function (image) {
        cb(null, Boolean(image));
      }));
    }
  ], domain.intercept(function (results) {
    json.inUse = results[0];
    json.inUseByNonOwner = results[1];
    cb(null, json);
  }));
};
module.exports = mongoose.model('Specifications', SpecificationSchema);