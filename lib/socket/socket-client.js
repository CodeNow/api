'use strict';

var app = require('../../app.js');
var debug = require('debug')('runnable-api:socket:socket-client');
var formatArgs = require('format-args');
var error = require('error');

module.exports = SocketClient;

/**
 * SocketClient that connects to the SocketServer.
 * We get PrimusSocket from primus instances attached to the apiServer.
 */
function SocketClient () {
  this.handlers = {};
  var PrimusSocket = app.getPrimusSocket();

  var token = process.env.PRIMUS_AUTH_TOKEN;
  var url = process.env.FULL_API_DOMAIN + ':' + process.env.PORT +
    '?token=' + token;
  this.primusClient = new PrimusSocket(url);
  this.primusClient.on('error', error.log.bind(error));
  this.primusClient.on('data', function (data) {
    var eventData = data.data;
    var eventName = eventData.event;
    var actionName = eventData.action;
    var payload = eventData.data || {};
    var fullEventName = buildEventName(eventName, actionName, payload);
    var func = this.handlers[fullEventName];
    if (func && typeof func === 'function') {
      func(payload);
      // remove handler
      delete this.handlers[fullEventName];
    }
  }.bind(this));
}

/**
 * Join room by `orgId` to receive all events for the org.
 */
SocketClient.prototype.joinOrgRoom = function (orgId) {
  debug('joinOrgRoom', formatArgs(arguments));
  this.primusClient.write({
    id: orgId,
    event: 'subscribe',
    data: {
      action: 'join',
      type: 'org',
      name: orgId
    }
  });
};

/**
 * Leave room by `orgId` and stop receiving all events for the org.
 */
SocketClient.prototype.leaveOrgRoom = function (orgId) {
  debug('leaveOrgRoom', formatArgs(arguments));
  this.primusClient.write({
    id: orgId,
    event: 'subscribe',
    data: {
      action: 'leave',
      type: 'org',
      name: orgId
    }
  });
};

/**
 * Add handler for the event. Function will be called only **ONCE**.
 * After one call handler would be removed.
 * @param {String} eventName event name
 * @param {Function} func      handler for the event
 */
SocketClient.prototype.addHandler = function (eventName, func) {
  debug('addHandler', formatArgs(arguments));
  this.handlers[eventName] = func;
};

/**
 * Close connection to the socket server.
 */
SocketClient.prototype.destroy = function () {
  debug('destroy', formatArgs(arguments));
  this.primusClient.end();
};

function buildEventName (eventName, actionName, payload) {
  return [eventName, actionName, payload.id].join(':');
}
