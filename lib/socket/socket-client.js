'use strict';

var ip = require('ip');
var apiServer = require('../../app.js').apiServer;
var debug = require('debug')('runnable-api:socket:socket-client');


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
    console.log('primus client data full eventName', fullEventName, this.handlers, payload.build);
    var func = this.handlers[fullEventName];
    console.log('found handler function', func);
    if (func && typeof func === 'function') {
      func(payload);
    }
  }.bind(this));
}


SocketClient.prototype.joinOrgRoom = function (orgId) {
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

SocketClient.prototype.addHandler = function (eventName, func) {
  debug('adding handler', eventName, func);
  this.handlers[eventName] = func;
}

// TODO investigate this func
function buildEventName (eventName, actionName, payload) {
  if (eventName === 'INSTANCE_UPDATE') {
    return [eventName, actionName, payload.shortHash].join(':');
  } else {
    return [eventName, actionName, payload.id].join(':');
  }
}

module.exports = SocketClient;