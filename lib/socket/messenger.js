/**
 * TODO document
 * @module lib/socket/messenger
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var uuid = require('uuid');
var keypather = require('keypather')();

var GitHub = require('models/apis/github');
var rabbitMQ = require('models/rabbitmq');
var User = require('models/mongo/user');
var dogstatsd = require('models/datadog');
var logger = require('middlewares/logger')(__filename);


var log = logger.log;

module.exports = new Messenger();

var baseDataName = 'api.socket.messenger';
function Messenger () {}

Messenger.prototype.setServer = function (server) {
  if (!server) { throw new Error('Messenger needs server'); }
  this.server = server;
};

/**
 * emit a message to a room with a specially formatted name
 * @param {String} type
 * @param {String} name
 * @param {Object|String|Buffer} data
 * @return null
 */
Messenger.prototype.messageRoom = function (type, name, data) {
  if (!this.server) {
    throw new Error('setServer has not been called yet');
  }
  log.trace({
    tx: true,
    logName: name,
    type: type,
    data: data
  }, 'messageRoom');
  this.server.room(genRoomName(type, name)).write({
    id: uuid(),
    event: 'ROOM_MESSAGE',
    type: type,
    name: name,
    data: data
  });
};

Messenger.prototype.joinRoom = function (socket, type, name) {
  socket.join(genRoomName(type, name));
};

Messenger.prototype.leaveRoom = function (socket, type, name) {
  socket.leave(genRoomName(type, name));
};

/**
 * emit instance update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 *   start, stop, restart, update, redeploy, deploy, delete, patch, post
 * This requries that the owner and createdBy fields have more github informatino in them
 */
Messenger.prototype.emitInstanceUpdate = function (instance, action) {
  log.trace({
    tx: true,
    instance: instance,
    action: action
  }, 'emitInstanceUpdate');
  if (!instance || !action) {
    throw new Error('emitInstanceUpdate missing instance or action');
  }
  var requiredKeypaths = [
    'owner',
    'owner.github',
    'owner.username',
    'owner.gravatar',
    'createdBy',
    'createdBy.github',
    'createdBy.username',
    'createdBy.gravatar'
  ];
  // keypather.in because _sometimes_ it's a mongoose model
  if (!requiredKeypaths.every(keypather.in.bind(keypather, instance))) {
    requiredKeypaths.forEach(function (kp) {
      log.trace({
        tx: true,
        kp: kp,
        instance: instance
      }, 'emitInstanceUpdate expects keypath exists');
    });
    throw new Error('emitInstanceUpdate malformed instance');
  }
  this._emitInstanceUpdateAction(instance, action);
};

/**
 * emit instance delete event
 * @param  {object}   instance instance to send
 */
Messenger.prototype.emitInstanceDelete = function (instance) {
  log.trace({
    tx: true,
    instance: instance
  }, 'emitInstanceDelete');
  this._emitInstanceUpdateAction(instance, 'delete');
};

/**
 * emit instance update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 */
Messenger.prototype._emitInstanceUpdateAction = function (instance, action) {
  log.trace({
    tx: true,
    instance: instance,
    action: action
  }, '_emitInstanceUpdateAction');
  if (!instance) {
    throw new Error('emitInstanceUpdate missing instance');
  }
  this.messageRoom('org', instance.owner.github, {
    event: 'INSTANCE_UPDATE',
    action: action,
    data: instance
  });

  if (action === 'post') {
    rabbitMQ.instanceCreated({
      instance: instance,
      timestamp: new Date().valueOf()
    });
  } else {
    rabbitMQ.instanceUpdated({
      instance: instance,
      timestamp: new Date().valueOf()
    });
  }

};

/**
 * emit instnce update event
 * @param  {object}   contextVersion instance to send
 * @param  'string'   action   valid actions
 *   build_started, build_running, build_complete
 */
Messenger.prototype.emitContextVersionUpdate = function (contextVersion, action) {
  log.trace({
    tx: true,
    contextVersion: contextVersion,
    action: action
  }, 'emitContextVersionUpdate');
  var self = this;
  if (!contextVersion ||
    !keypather.get(contextVersion, 'createdBy.github') ||
    !keypather.get(contextVersion, 'owner.github') ||
    !action) {
    throw new Error('emitContextVersionUpdate missing inputs');
  }
  self.messageRoom('org', contextVersion.owner.github, {
    event: 'CONTEXTVERSION_UPDATE',
    action: action,
    data: contextVersion
  });
};

/**
 * Validates if user can join the room.
 */
Messenger.prototype.canJoin = function (socket, data, cb) {
  var logData = {
    tx: true,
    logName: data.name,
    type: data.type,
    action: data.action
  };
  log.info(logData, 'Messenger.prototype.canJoin');
  // auth token used when we connect from other server
  var authToken = keypather.get(socket, 'request.query.token');
  var userId = keypather.get(socket, 'request.session.passport.user');
  // github org or user id for personal accounts
  var accountId = data.name;
  // always join room if we connected using `authToken`
  if (authToken) {
    log.info(logData, 'Messenger.prototype.canJoin: true with accessToken');
    return cb(null, true);
  }
  if (!userId) {
    log.error(logData, 'Messenger.prototype.canJoin: false without accessToken and userId');
    return cb(null, false);
  }
  User.findById(userId, function (err, user) {
    if (err) {
      log.error(logData, 'Messenger.prototype.canJoin: false when user fetch error');
      return cb(err);
    }
    if (!user) {
      log.error(logData, 'Messenger.prototype.canJoin: false when user fetch not found');
      return cb(Boom.notFound('User not found', { data: userId }));
    }
    // in this case user is joining room for his personal account
    if (user.accounts.github.id === accountId) {
      log.info(logData, 'Messenger.prototype.canJoin: true when user joins his/her room');
      return cb(null, true);
    }
    // find org and check membership
    user.findGithubOrgByGithubId(accountId, function (err, org) {
      if (err) {
        log.error(logData, 'Messenger.prototype.canJoin: false when org fetch error');
        return cb(err);
      }
      if (!org) {
        log.error(logData, 'Messenger.prototype.canJoin: false when org not found');
        return cb(Boom.notFound('Org not found', { data: accountId }));
      }
      var github = new GitHub({ token: user.accounts.github.accessToken });
      github.isOrgMember(org.login, cb);
    });
  });
};


/*jshint maxcomplexity:20*/
Messenger.prototype.subscribeStreamHandler = function (socket, id, data) {
  dogstatsd.increment(baseDataName+'.connections');
  // check required args
  if (!data.name ||
    !data.type ||
    !data.action) {
    dogstatsd.increment(baseDataName + '.err.invalid_args');
    return socket.write({
      id: id,
      error: 'name, type and action are required',
      data: data
    });
  }

  if (~data.action.indexOf('join')) {
    this.canJoin(socket, data, function (err, join) {
      if (err || join === false) {
        return socket.write({
          id: id,
          error: 'access denied',
          data: data
        });
      }
      this.joinRoom(socket, data.type, data.name);
      roomActionComplete(socket, id, data);
    }.bind(this));
  } else if (~data.action.indexOf('leave')) {
    this.leaveRoom(socket, data.type, data.name);
    roomActionComplete(socket, id, data);
  } else {
    return socket.write({
      id: id,
      error: 'invalid action',
      data: data
    });
  }
};

function roomActionComplete (socket, id, data) {
  log.trace({
    tx: true,
    logName: data.name,
    type: data.type,
    action: data.action
  }, 'roomActionComplete');
  socket.write({
    id: id,
    event: 'ROOM_ACTION_COMPLETE',
    data: {
      type: data.type,
      name: data.name,
      action: data.action
    }
  });
}

function genRoomName (type, name) {
  return process.env.MESSENGER_NAMESPACE+type+':'+name;
}
