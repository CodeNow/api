/**
 * @module lib/socket/socket-client
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var ContextVersion = require('models/mongo/context-version');
var dogstatsd = require('models/datadog');
var app = require('../../app.js');
var error = require('error');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = SocketClient;

/**
 * SocketClient that connects to the SocketServer.
 * We get PrimusSocket from primus instance attached to the apiServer.
 */
function SocketClient () {
  this.handlers = {};
  var PrimusSocket = app.getPrimusSocket();
  var url = process.env.FULL_API_DOMAIN;
  this.primusClient = new PrimusSocket(url);
  dogstatsd.increment('api.socket.client.open-sockets');
  this.primusClient.on('error', function onPrimusClientError (err) {
    dogstatsd.increment('api.socket.client.err');
    var boomErr = Boom.badImplementation('SocketClient error', { err: err });
    error.log(err);
    log.error({
      tx: true,
      url: url,
      err: boomErr
    }, 'SocketClient.primusClient.error');
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
      dogstatsd.increment('api.socket.client.msg');
    }
  }.bind(this));
}

/**
 * Join room by `orgId` to receive all events for the org.
 */
SocketClient.prototype.joinOrgRoom = function (orgId) {
  log.trace({
    tx: true,
    orgId: orgId
  }, 'joinOrgRoom');
  this.primusClient.write({
    id: orgId,
    event: 'subscribe',
    data: {
      action: 'join',
      type: 'org',
      name: orgId
    }
  });
  dogstatsd.increment('api.socket.client.join-org-room');
};

/**
 * Leave room by `orgId` and stop receiving all events for the org.
 */
SocketClient.prototype.leaveOrgRoom = function (orgId) {
  log.trace({
    tx: true,
    orgId: orgId
  }, 'leaveOrgRoom');
  this.primusClient.write({
    id: orgId,
    event: 'subscribe',
    data: {
      action: 'leave',
      type: 'org',
      name: orgId
    }
  });
  dogstatsd.increment('api.socket.client.leave-org-room');
};

/**
 * Add handler for the event. Function will be called only **ONCE**.
 * After one call handler would be removed.
 * @param {String} eventName event name
 * @param {Function} func      handler for the event
 */
SocketClient.prototype.addHandler = function (eventName, func) {
  log.trace({
    tx: true,
    eventName: eventName
  }, 'addHandler');
  this.handlers[eventName] = func;
};

/**
 * Remove handler for the event.
 * @param {String} eventName event name
 */
SocketClient.prototype.removeHandler = function (eventName) {
  log.trace({
    tx: true,
    eventName: eventName
  }, 'removeHandler');
  delete this.handlers[eventName];
};

/**
 * Close connection to the socket server.
 */
SocketClient.prototype.destroy = function () {
  log.trace({
    tx: true
  }, 'destroy');
  this.primusClient.end();
  dogstatsd.increment('api.socket.client.destroy');
  dogstatsd.decrement('api.socket.client.open-sockets');
};

/**
 * Call `cb` when `cvId` was build. We can know that either from quering db or
 * from the event.
 * @param {String} cvId - contextVersion id to be build.
 * @param {Function} cb - standard callback
 */
 SocketClient.prototype.onBuildCompleted = function (cvId, cb) {
  // listen on build completed event
  var self = this;
  var buildCompletedEvent = [
    'CONTEXTVERSION_UPDATE',
    'build_completed',
    cvId
  ].join(':');
  this.addHandler(buildCompletedEvent, function (contextVersion) {
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
      self.removeHandler(buildCompletedEvent);
      cb(err, cv);
      dogstatsd.increment('api.socket.client.build-completed');
    }
  }
};


/**
 * Call `cb` when instance is running with the new build.
 * If instance has not `containers`  it's no running yet and we need to listen
 * for `deploy` event.
 * @param {String} instance - insatnce to be deployed with new build
 * @param {String} buildId - built id to be deployed to the instance
 * @param {Function} cb - standard callback
 */
 SocketClient.prototype.onInstanceDeployed = function (instance, buildId, cb) {
   var self = this;
   var instanceId = instance._id;
   if (instance.containers && instance.containers.length > 0) {
     safeCallback(null, instance);
   }
   else {
     // listen on build completed event
     var instanceDeployedEvent = [
       'INSTANCE_UPDATE',
       'deploy',
       instanceId
     ].join(':');
     this.addHandler(instanceDeployedEvent, function (deployedInstance) {
       safeCallback(null, deployedInstance);
     });
   }
   var called = false;
   function safeCallback (err, inst) {
     if (!called) {
       called = true;
       self.removeHandler(instanceDeployedEvent);
       cb(err, inst);
       dogstatsd.increment('api.socket.client.instance-deployed');
     }
   }
};


function buildEventName (eventName, actionName, payload) {
  return [eventName, actionName, payload.id].join(':');
}
