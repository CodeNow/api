'use strict';
var mongoose = require('mongoose');
var SettingsSchema = require('models/mongo/schemas/settings');


SettingsSchema.statics.findSettingsForOwner = function (owner, cb) {
  this.findOne({owner: owner}, cb);
};

module.exports = mongoose.model('Settings', SettingsSchema);