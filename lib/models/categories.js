var mongoose = require('mongoose');
var Base = require('./Base');
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

categorySchema.methods.returnJSON = function (cb) {
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

module.exports = Base.discriminator('Categories', categorySchema);