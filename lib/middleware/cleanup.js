var async = require('async');
var configs = require('../configs');
var Container = require('../models/containers');
var request = require('request');
var User = require('../models/users');
var Harbourmaster = require('../models/harbourmaster');
var cleanup = module.exports = {
  onFirstRun: function (req, res, next) {
    if (req.query.firstRun) {
      var week = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
      var unsavedAndWayExpired = {
        saved: false,
        created: { $lte: week }
      };
      Container.remove(unsavedAndWayExpired, next);
    } else {
      next();
    }
  },
  listSavedContainers: function (req, res, next) {
    var timeout = new Date().getTime() - configs.containerTimeout;
    Container.find({
      $or: [
        { saved: true },
        { created: { $gte: timeout } }
      ]
    }, { owner: 1, servicesToken: 1 }, req.domain.intercept(function saveContainers (containers) {
      req.containers = containers;
      next();
    }));
  },
  getOwners: function (req, res, next) {
    var userIds = req.containers.map(function getOwnerId (container) {
      return container.owner.toString();
    });
    var query = { _id: { $in: userIds } };
    var fields = {
      permission_level: 1,
      _id: 1
    };
    User.find(query, fields, req.domain.intercept(function attachOwners (owners) {
      var ownersHash = {};
      owners.forEach(function (owner) {
        ownersHash[owner._id] = owner;
      });
      req.containers.forEach(function (container) {
        container.ownerJSON = ownersHash[container.owner];
      });
      next();
    }));
  },
  hasRegisteredOwner: function (container) {
    return container.ownerJSON && container.ownerJSON.permission_level > 0;
  },
  cleanupContainersNotIn: function (req, res, next) {
    var whitelist = req.containers.filter(cleanup.hasRegisteredOwner);
    var whiteContainerIds = [];
    var whiteServicesTokens = [];
    whitelist.forEach(function fillLists (container) {
      whiteContainerIds.push(container._id);
      whiteServicesTokens.push(container.servicesToken);
    });
    async.parallel([
      function cleanMongo (cb) {
        var notInWhitelist = { _id: { $nin: whiteContainerIds } };
        Container.remove(notInWhitelist, req.domain.intercept(cb));
      },
      function cleanDocker (cb) {
        Harbourmaster.cleanup(whiteServicesTokens, req.domain.intercept(cb));
      }
    ], next);
  }
};