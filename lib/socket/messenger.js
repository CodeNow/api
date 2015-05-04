/**
 * TODO document
 * @module lib/socket/messenger
 */
'use strict';

var debug = require('debug')('runnable-api:socket:messenger');
var uuid = require('uuid');
var keypather = require('keypather')();

var Boom = require('dat-middleware').Boom;
var dogstatsd = require('models/datadog');
var GitHub = require('models/apis/github');
var Context = require('models/mongo/context');
var User = require('models/mongo/user');
var error = require('error');

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
  debug('messageRoom', name, type, data);
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

Messenger.prototype.emitImagePulling = function (instance, stream) {
  debug('emitImagePulling');
  var self = this;
  stream.on('data', function (data) {
    self.messageRoom('org', instance.owner.github, {
      event: 'INSTANCE_PULLING',
      id: instance._id,
      data: data
    });
  });
};

/**
 * emit instnce update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 *   start, stop, restart, update, redeploy, deploy, delete, patch, post
 * This requries that the owner and createdBy fields have more github informatino in them
 */
Messenger.prototype.emitInstanceUpdate = function (instance, action) {
  debug('emitInstanceUpdate');
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
    throw new Error('emitInstanceUpdate malformed instance');
  }
  this.messageRoom('org', instance.owner.github, {
    event: 'INSTANCE_UPDATE',
    action: action,
    data: instance
  });
};

/**
 * emit instnce update event
 * @param  {object}   contextVersion instance to send
 * @param  'string'   action   valid actions
 *   build_started, build_running, build_complete
 */
Messenger.prototype.emitContextVersionUpdate = function (contextVersion, action) {
    debug('emitContextVersionUpdate');
    var self = this;
    if (!contextVersion ||
      !contextVersion.createdBy ||
      !contextVersion.createdBy.github ||
      !action) {
      throw new Error('emitContextVersionUpdate missing inputs');
    }
    Context.findById(contextVersion.context, { owner : 1 }, function (err, context) {
      if (err) { return error.log(err); }
      self.messageRoom('org', context.owner.github, {
        event: 'CONTEXTVERSION_UPDATE',
        action: action,
        data: contextVersion
      });
    });
};

/**
 * Validates if user can join the room.
 */
Messenger.prototype.canJoin = function (socket, data, cb) {
  // auth token used when we connect from other server
  var authToken = keypather.get(socket, 'request.query.token');
  var userId = keypather.get(socket, 'request.session.passport.user');
  // github org or user id for personal accounts
  var accountId = data.name;
  // always join room if we connected using `authToken`
  if (authToken) {
    return cb(null, true);
  } else if (userId){
    User.findById(userId, function (err, user) {
      if (err) {
        return cb(err);
      }
      if (!user) {
        return cb(Boom.notFound('User not found', { data: userId }));
      }
      // in this case user is joining room for his personal account
      if (user.accounts.github.id === accountId) {
        return cb(null, true);
      }
      // find org and check membership
      user.findGithubOrgByGithubId(accountId, function (err, org) {
        if (err) {
          return cb(err);
        }
        if (!org) {
          return cb(Boom.notFound('Org not found', { data: accountId }));
        }
        var github = new GitHub({ token: user.accounts.github.accessToken });
        github.isOrgMember(org.login, cb);
      });
    });
  } else {
    cb(null, false);
  }
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
  debug('subscribeStreamHandler', data.name, data.type, data.action);
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
