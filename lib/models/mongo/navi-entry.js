/**
 * Navi instance routing data
 * @module models/navi-entry
 */
'use strict';

var keypather = require('keypather')();
var mongoose = require('mongoose');

var logger = require('middlewares/logger')(__filename);
var NaviEntrySchema = require('models/mongo/schemas/navi-entry');

var log = logger.log;

NaviEntrySchema.statics._getDirectURlObj = function (instance, cb) {
  log.trace({
    tx: true
  }, 'NaviEntrySchema.statics._getDirectURlObj');
  instance.getDependencies(function (err, dependencies) {
    if (err) {
      log.trace({
        tx: true,
        err: err
      }, 'NaviEntrySchema.statics._getDirectURlObj error DB');
      return cb(err);
    }
    return cb(null, {
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
    log.trace({
      tx: true
    }, 'NaviEntrySchema.statics.handleNewInstance Error instance owner.username not populated');
    return cb(new Error('instance owner and username must be populated'));
  }
  log.trace({
    tx: true
  }, 'NaviEntrySchema.statics.handleNewInstance');
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
      naviEntry.save(function (err) {
        if (err) {
          log.trace({
            tx: true
          }, 'NaviEntrySchema.statics.handleNewInstance error saving nave entry');
        }
        cb(err);
      });
    } else {
      var updateCommand = { $set: {} };
      updateCommand.$set['direct-urls.' + instance.shortHash] = directUrlObj;
      var find = {};
      find['direct-urls.' + instance.shortHash] = {$exists: true};
      NaviEntry.findOneAndUpdate(find, updateCommand, function (err) {
        if (err) {
          log.trace({
            tx: true
          }, 'NaviEntrySchema.statics.handleNewInstance error NaviEntry does not exist to update');
        }
        return cb(err);
      });
    }
  });
};

/**
 * Handle when the instance changes to started/stopped/crashed etc
 * @param {Object} instance
 * @param {Function} cb
 */
NaviEntrySchema.statics.handleInstanceStatusChange = function (instance, cb) {
  log.trace({
    tx: true
  }, 'NaviEntrySchema.statics.handleInstanceStatusChange');
  instance.status(function (err, status) {
    if (err) {return cb(err); }
    var updateCommand = {$set: {}};
    var setBasePath = 'direct-urls.' + instance.shortHash;
    updateCommand.$set[setBasePath + '.dockerHost'] =
      keypather.get(instance, 'container.dockerHost');
    updateCommand.$set[setBasePath + '.ports'] = keypather.get(instance, 'container.ports');
    updateCommand.$set[setBasePath + '.status'] = status;
    var find = {};
    find['direct-urls.' + instance.shortHash] = { $exists: true };
    NaviEntry.findOneAndUpdate(find, updateCommand, function (err) {
      if (err) {
        log.trace({
          tx: true
        }, 'NaviEntrySchema.statics.handleInstanceStatusChange ' +
          'error NaviEntry does not exist to update');
      }
      cb(err);
    });
  });
};

var NaviEntry = module.exports = mongoose.model('NaviEntries', NaviEntrySchema);
