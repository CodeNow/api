var async = require('async');
var configs = require('./configs');
var containers = require('./models/containers');
var request = require('request');
var users = require('./models/users');
var _ = require('lodash');
function onFirstRun (cb) {
  var unsavedAndWayExpired, week;
  week = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  unsavedAndWayExpired = {
    saved: false,
    created: { $lte: week }
  };
  return containers.count(unsavedAndWayExpired, function (err, count) {
    if (err) {
      return console.error(err);
    } else {
      return containers.remove(unsavedAndWayExpired, function (err) {
        if (err) {
          return console.error(err);
        } else {
          console.log('PURGE VERY EXPIRED DB CONTAINERS: ', count);
          return cb();
        }
      });
    }
  });
}
function hasRegisteredOwner (container) {
  var registeredOwner;
  registeredOwner = container.ownerJSON && container.ownerJSON.permission_level > 0;
  return registeredOwner;
}
function getOwners (domain, containers, cb) {
  var fields, query, userIds;
  userIds = containers.map(function (container) {
    return container.owner.toString();
  });
  query = { _id: { $in: userIds } };
  fields = {
    permission_level: 1,
    _id: 1
  };
  return users.find(query, fields, domain.intercept(function (users) {
    var userHash;
    userHash = {};
    users.forEach(function (user) {
      userHash[user._id] = user;
    });
    containers.forEach(function (container) {
      container.ownerJSON = userHash[container.owner];
    });
    return cb(null, containers);
  }));
}
function cleanupContainersNotIn (domain, whitelist, cb) {
  var whiteContainerIds, whiteServicesTokens;
  if (whitelist.length === 0) {
    cb();
  }
  whiteContainerIds = [];
  whiteServicesTokens = [];
  whitelist.forEach(function (container) {
    whiteContainerIds.push(container._id);
    return whiteServicesTokens.push(container.servicesToken);
  });
  return async.parallel([
    function (cb) {
      var notInWhitelist;
      notInWhitelist = { _id: { $nin: whiteContainerIds } };
      return containers.count(notInWhitelist, domain.intercept(function () {
        return containers.remove(notInWhitelist, domain.intercept(function () {
          return cb();
        }));
      }));
    },
    function (cb) {
      return request({
        url: '' + configs.harbourmaster + '/containers/cleanup',
        method: 'POST',
        json: whiteServicesTokens,
        pool: false
      }, function (err, res, body) {
        if (err) {
          return domain.emit('error', err);
        } else {
          if (res.statusCode !== 200) {
            return cb({
              status: 500,
              message: 'whitelist not accepted by harbourmaster',
              body: body
            });
          } else {
            return cb();
          }
        }
      });
    }
  ], cb);
}
module.exports = function (req, res) {
  var sendError;
  sendError = function (err) {
    var status;
    status = err.status;
    delete err.status;
    return res.json(status || 403, err);
  };
  return async.series([
    function (cb) {
      if (req.query.firstRun) {
        return onFirstRun(cb);
      } else {
        return cb();
      }
    },
    function (cb) {
      var domain;
      domain = req.domain;
      return users.findUser(domain, { _id: req.user_id }, domain.intercept(function (user) {
        if (!user) {
          return cb({ message: 'permission denied: no user' });
        } else {
          if (!user.isModerator) {
            return cb({ message: 'permission denied' });
          } else {
            return containers.listSavedContainers(req.domain, function (containers) {
              return getOwners(domain, containers, function (err) {
                var dateNow, validContainers;
                if (err) {
                  return cb(err);
                } else {
                  dateNow = Date.now();
                  validContainers = containers.filter(hasRegisteredOwner);
                  return cleanupContainersNotIn(domain, validContainers, cb);
                }
              });
            });
          }
        }
      }));
    }
  ], function (err) {
    if (err) {
      return sendError(err);
    } else {
      return res.json(200, { message: 'successfuly sent prune request to harbourmaster and cleaned mongodb' });
    }
  });
};