'use strict';
var keypather = require('keypather')();
var ContextVersion = require('models/mongo/context-version');

/**
 * Create new socket client (primus) and join the `orgIdKey` room.
 * @param {String} orgIdKey - key under which `orgId` can be found in `req`.
 */
module.exports.createSocketClient = function (orgIdKey) {
  return function (req, res, next) {
    var SocketClient = require('socket/socket-client.js');
    var socketClient = new SocketClient();
    var orgId = keypather.get(req, orgIdKey);
    socketClient.joinOrgRoom(orgId);
    req.socketClient = socketClient;
    next();
  };
};

/**
 * Delete socket client (primus) and leave the `orgId` room before.
 * @param {String} orgId - orgId which correspons to the room which we should leave.
 */
 module.exports.deleteSocketClient = function (orgId) {
   return function (req, res, next) {
    req.socketClient.leaveOrgRoom(orgId);
    req.socketClient.destroy();
    delete req.socketClient;
    next();
  };
};


/**
 * Call `cb` when `cvId` was build. We can know that either from quering db or
 * from the event.
 * @param {String} cvId - contextVersion id to be build.
 * @param {Object} socketClient - socket client which is used for listening events
 * @param {Function} cb - standard callback
 */
module.exports.onBuildCompleted = function (cvId, socketClient, cb) {
  // listen on build completed event
  var buildCompletedEvent = [
    'CONTEXTVERSION_UPDATE',
    'build_completed',
    cvId
  ].join(':');
  socketClient.addHandler(buildCompletedEvent, function (contextVersion) {
    safeCallback(null, contextVersion);
  });
  var query = {
    _id: cvId,
    'build.completed': { $exists: true }
  };
  ContextVersion.findOne(query, function (err, completedCv) {
    if (err) { return safeCallback(err); }
    // check to see if the contextversion has already finished before
    //     the event cb was attached.
    if (completedCv) {
      safeCallback(null, completedCv);
    }
    // else wait for event
  });
  var called = false;
  function safeCallback (err, cv) {
    if (!called) {
      called = true;
      cb(err, cv);
    }
  }
};
