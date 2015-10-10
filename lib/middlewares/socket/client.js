'use strict';
var keypather = require('keypather')();

/**
 * Create new socket client (primus) and join the `orgIdKey` room.
 * @param {String} orgIdKey - key under which `orgId` can be found in `req`.
 */
module.exports.createSocketClient = function(orgIdKey) {
  return function(req, res, next) {
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
module.exports.deleteSocketClient = function(orgId) {
  return function(req, res, next) {
    req.socketClient.leaveOrgRoom(orgId);
    req.socketClient.destroy();
    delete req.socketClient;
    next();
  };
};
