/**
 * Navi instance routing data
 * @module models/navi-entry
 */
'use strict';

var keypather = require('keypather')();
var mongoose = require('mongoose');

var NaviEntrySchema = require('models/mongo/schemas/navi-entry');

NaviEntrySchema.statics._getDirectURlObj = function (instance, cb) {
  instance.getDependencies(function (err, dependencies) {
    if (err) { return cb(err); }
    cb(null, {
      branch: instance.getMainBranchName(),
      url: instance.getDirectHostname(instance.owner.username),
      dependencies: dependencies
    });
  });
};

/**
 * Create or update a navi entry document when an instance is created
 * Create a new navi entry document if this is a masterPod instance
 * Update an existing navi entry document if this is not a masterPod instance
 * @param {Object} instance
 * @param {Function} cb
 */
NaviEntrySchema.statics.handleNewInstance = function (instance, cb) {
  if (!keypather.get(instance, 'owner.username')) {
    return cb(new Error('instance owner and username must be populated'));
  }
  NaviEntrySchema.statics._getDirectURlObj(instance, function (err, directUrlObj) {
    if (err) { return cb(err); }

    if (instance.masterPod) {
      var directUrls = {};
      directUrls[instance.shortHash] = directUrlObj;
      var naviEntry = new NaviEntry({
        elasticUrl: instance.getElasticHostname(instance.owner.username),
        ownerGithubId: instance.owner.github,
        directUrls: directUrls
      });
      naviEntry.save(cb);
    } else {
      var updateCommand = { $set: {} };
      updateCommand.$set['direct-urls.' + instance.shortHash] = directUrlObj;
      NaviEntry.findOneAndUpdate({
        'elastic-url': instance.getElasticHostname(instance.owner.username)
      }, updateCommand, cb);
    }
  });
};

/**
 * Handle when the instance changes to started/stopped/crashed etc
 * @param {Object} instance
 * @param {Function} cb
 */
NaviEntrySchema.statics.handleInstanceStatusChange = function (instance, cb) {
  if (!keypather.get(instance, 'owner.username')) {
    return cb(new Error('instance owner and username must be populated'));
  }
  var updateCommand = {$set: {}};
  var setBasePath = 'direct-urls.'+instance.shortHash;
  updateCommand.$set[setBasePath + '.dockerHost'] = keypather.get(instance, 'container.dockerHost');
  updateCommand.$set[setBasePath + '.ports'] = keypather.get(instance, 'container.ports');
  updateCommand.$set[setBasePath + '.status'] = instance.status();
  NaviEntry.findOneAndUpdate({
    'elastic-url': instance.getElasticHostname(instance.owner.username)
  }, updateCommand, cb);
};

var NaviEntry = module.exports = mongoose.model('NaviEntries', NaviEntrySchema);
