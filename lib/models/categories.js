var _ = require('lodash');
var mongoose = require('mongoose');
var BaseSchema = require('./BaseSchema');
var Schema = mongoose.Schema;
var CategorySchema = new Schema({
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

_.extend(CategorySchema.methods, BaseSchema.methods);
_.extend(CategorySchema.statics, BaseSchema.statics);

// add aliases on when setting a channel name
CategorySchema.path('name').set(function (name) {
  if (!name) {
    return name;
  }
  this.aliases.push(name.toString().toLowerCase());
  return name;
});

CategorySchema.methods.returnJSON = function (cb) {
  var Channel = require('models/channels');
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

module.exports = mongoose.model('Categories', CategorySchema);