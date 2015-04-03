'use strict';

var ip = require('ip');
var apiServer = require('../../app.js').apiServer;
var debug = require('debug')('runnable-api:socket:socket-client');
var formatArgs = require('format-args');
var error = require('error');

function SocketClient () {
  this.handlers = {};
  var PrimusSocket = apiServer.socketServer.primus.Socket;

  var token = process.env.PRIMUS_AUTH_TOKEN;
  var url = 'http://' + ip.address() + ':' + process.env.PORT +
    '?token=' + token;
  this.primusClient = new PrimusSocket(url);
  this.primusClient.on('error', function (err) {
    error.log(err);
  });
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
 * Close connection to the socket server
 */
SocketClient.prototype.destroy = function () {
  debug('destroy', formatArgs(arguments));
  this.primusClient.end();
};

function buildEventName (eventName, actionName, payload) {
  return [eventName, actionName, payload.id].join(':');
}

module.exports = SocketClient;
