'use strict';

var ip = require('ip');
var apiServer = require('../../app.js').apiServer;
var debug = require('debug')('runnable-api:socket:socket-client');
var formatArgs = require('format-args');

function SocketClient () {
  this.handlers = {};
  var PrimusSocket = apiServer.socketServer.primus.Socket;

  var url = 'http://' + ip.address() + ':' + process.env.PORT;
  this.primusClient = new PrimusSocket(url);
  this.primusClient.on('error', function (err) {
    console.log('primus client error', err);
  });
  this.primusClient.on('data', function (data) {
    console.log('primus client data', data);
    var eventData = data.data;
    var eventName = eventData.event;
    var actionName = eventData.action;
    var payload = eventData.data || {};
    var fullEventName = buildEventName(eventName, actionName, payload);
    console.log('primus client full eventName', fullEventName, this.handlers);
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
 * @param {[type]} func      handler for the event
 */
SocketClient.prototype.addHandler = function (eventName, func) {
  debug('addHandler', formatArgs(arguments));
  this.handlers[eventName] = func;
};

Soc.prototype.destroy = function () {
  debug('destroy', formatArgs(arguments));
  this.primusClient.destroy();
};

// TODO investigate this func
function buildEventName (eventName, actionName, payload) {
  if (eventName === 'INSTANCE_UPDATE') {
    return [eventName, actionName, payload.shortHash].join(':');
  } else {
    return [eventName, actionName, payload.id].join(':');
  }
}

module.exports = SocketClient;