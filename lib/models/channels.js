var async = require('async');
var Category = require('models/categories');
var BaseSchema = require('./BaseSchema');
var mongoose = require('mongoose');
var _ = require('lodash');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var ChannelSchema = new Schema({
  name: {
    type: String,
    index: true,
    unique: true
  },
  description: { type: String },
  base: { type: ObjectId },
  aliases: {
    type: [String],
    index: true,
    unique: true,
    'default': []
  },
  tags: {
    type: [{ category: ObjectId }],
    'default': []
  }
});
// ChannelSchema.set('autoIndex', false);

// add aliases on when setting a channel name
ChannelSchema.path('name').set(function (name) {
  if (!name) {
    return name;
  }
  this.aliases.push(name.toString().toLowerCase());
  return name;
});

_.extend(ChannelSchema.methods, BaseSchema.methods);
_.extend(ChannelSchema.statics, BaseSchema.statics);

ChannelSchema.methods.returnJSON = function (cb) {
  var json = this.toJSON();
  this.getTags(function (err, tags) {
    if (err) {
      return cb(err);
    }
    json.tags = tags;
    cb(null, json);
  });
};

ChannelSchema.methods.getTags = function (cb) {
  if (!this.tags) {
    return cb();
  }
  async.map(this.tags, function (tag, cb) {
    Category.findById(tag.category).lean().exec(function (err, category) {
      if (err) {
        return cb(err);
      }
      tag = tag.toJSON();
      cb(null, _.extend(tag, category));
    });
  }, cb);
};

ChannelSchema.methods.addAlias = function (alias, cb) {
  alias = alias.toLowerCase();
  var id = this._id;
  var query = {
    _id: id,
    aliases: { $ne: alias }
  };
  var update = {
    aliases: { $push: alias }
  };
  var self = this;
  Channel.findOneAndUpdate(query, update).lean().exec(function (err, updatedChannel) {
    if (err) {
      return cb(err);
    }
    if (updatedChannel) { // if channel updated
      self.set(updatedChannel);
    }
    cb();
  });
};

ChannelSchema.statics.findByName = function (name) {
  var args = Array.prototype.slice.call(arguments, 1); // slice off name arg
  var query = { aliases: name.toString().toLowerCase() };
  args.unshift(query);
  this.findOne.apply(this, args);
};

var Channel = module.exports = mongoose.model('Channels', ChannelSchema);
