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

CategorySchema.statics.findByName = function (name) {
  var args = Array.prototype.slice.call(arguments, 1); // slice off name arg
  var query = { aliases: name.toString().toLowerCase() };
  args.unshift(query);
  this.findOne.apply(this, args);
};

module.exports = mongoose.model('Categories', CategorySchema);