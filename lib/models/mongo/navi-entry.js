/**
 * Navi instance routing data
 * @module models/navi-entry
 */
'use strict';

var keypather = require('keypather')();
var mongoose = require('mongoose');

var NaviEntrySchema = require('models/mongo/schemas/navi-entry');

/**
 * Create or update a navi entry document
 * Create a new navi entry document if this is a masterPod instance
 * Update an existing navi entry document if this is not a masterPod instance
 * @param {Object} instance
 * @param {Function} cb
 */
NaviEntrySchema.statics.createOrUpdateNaviInstanceEntry = function (instance, cb) {
  if (!keypather.get(instance, 'owner.username')) {
    throw new Error('instance owner and username must be populated');
  };
  if (instance.masterPod) {
    var naviEntry = new NaviEntry({
      elasticUrl: instance.getElasticHostname(instance.owner.username),
      ownerGithubId: instance.owner.github
    });
    naviEntry.save(function (err) {
      console.log('err', err);
      cb();
    });
  } else {
    cb();
    console.log('not! masterpod');
  }
};

var NaviEntry = module.exports = mongoose.model('NaviEntries', NaviEntrySchema);
