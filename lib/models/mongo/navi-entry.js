/**
 * Navi instance routing data
 * @module models/navi-entry
 */
'use strict';

var keypather = require('keypather')();
var mongoose = require('mongoose');

var NaviEntrySchema = require('models/mongo/schemas/navi-entry');

function getDirectUrlObj(instance, cb) {
  instance.getDependencies(function (err, dependencies) {
    if (err) { return cb(err); }
    cb(null, {
      branch: instance.getMainBranchName(),
      url: instance.getDirectHostname(instance.owner.username),
      associations: dependencies
    });
  });
}

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
  }
  getDirectUrlObj(instance, function (err, directUrlObj){
    if (err) { return cb(err); }

    if (instance.masterPod) {
      var shortHash = instance.id();
      var directUrls = {};
      directUrls[shortHash] = directUrlObj;
      var naviEntry = new NaviEntry({
        elasticUrl: instance.getElasticHostname(instance.owner.username),
        ownerGithubId: instance.owner.github,
        directUrls: directUrls
      });
      naviEntry.save(cb);
    } else {
      cb();
      console.log('not! masterpod');
    }
  });
};

var NaviEntry = module.exports = mongoose.model('NaviEntries', NaviEntrySchema);
