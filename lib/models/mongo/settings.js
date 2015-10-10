'use strict';
var mongoose = require('mongoose');
var SettingsSchema = require('models/mongo/schemas/settings');


SettingsSchema.statics.findOneByGithubId = function(githubId, cb) {
  this.findOne({
    'owner.github': githubId
  }, cb);
};

module.exports = mongoose.model('Settings', SettingsSchema);