var __indexOf = [].indexOf;
var async = require('async');
var error = require('../error');
var users = require('./users');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var categorySchema = new Schema({
  name: {
    type: String,
    index: true,
    unique: true
  },
  description: { type: String },
  aliases: {
    type: [String],
    index: true,
    unique: true,
    'default': []
  }
});
categorySchema.set('autoIndex', false);

categorySchema.methods.returnJSON = function (cb) {
  var Channel = require('./channels');
  var self = this;
  Channel.find({
    'tags.category': this._id
  }).count().exec(function (err, count) {
    if (err) {
      cb(err);
    } else {
      var json = self.toJSON();
      json.count = count;
      cb(null, json);
    }
  });
};

module.exports = mongoose.model('Categories', categorySchema);