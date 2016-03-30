/**
 * TODO document
 * @module lib/socket/messenger
 */
'use strict'

var Boom = require('dat-middleware').Boom
var exists = require('101/exists')
var uuid = require('uuid')
var keypather = require('keypather')()
var Promise = require('bluebird')
var put = require('101/put')

var GitHub = require('models/apis/github')
var rabbitMQ = require('models/rabbitmq')
var Runnable = require('models/apis/runnable')
var User = require('models/mongo/user')
var dogstatsd = require('models/datadog')
var logger = require('middlewares/logger')(__filename)
var ErrorCat = require('error-cat')
var error = new ErrorCat()

var log = logger.log

module.exports = new Messenger()

var baseDataName = 'api.socket.messenger'
function Messenger () {
  this.runnable = new Runnable()
}

Messenger.prototype.setServer = function (server) {
  if (!server) { throw new Error('Messenger needs server') }
  this.server = server
}

/**
 * emit a message to a room with a specially formatted name
 * @param {String} type
 * @param {String} name
 * @param {Object|String|Buffer} data
 * @return null
 */
Messenger.prototype.messageRoom = function (type, name, data) {
  if (!this.server) {
    throw new Error('setServer has not been called yet')
  }
  log.trace({
    tx: true,
    logName: name,
    type: type,
    data: data
  }, 'messageRoom')
  this.server.room(genRoomName(type, name)).write({
    id: uuid(),
    event: 'ROOM_MESSAGE',
    type: type,
    name: name,
    data: data
  })
}

Messenger.prototype.joinRoom = function (socket, type, name) {
  socket.join(genRoomName(type, name))
}

Messenger.prototype.leaveRoom = function (socket, type, name) {
  socket.leave(genRoomName(type, name))
}

/**
 * emit instance update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 *   start, stop, restart, update, redeploy, deploy, delete, patch, post
 * This requries that the owner and createdBy fields have more github informatino in them
 */
Messenger.prototype.emitInstanceUpdate = function (instance, action) {
  var logData = {
    tx: true,
    instance: instance,
    action: action
  }
  log.info(logData, 'Messenger.prototype.emitInstanceUpdate')
  if (!instance || !action) {
    log.fatal('emitInstanceUpdate missing instance or action')
    throw new Error('emitInstanceUpdate missing instance or action')
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
  ]

  // we need to ensure that values for those keypathes exist
  for (var i in requiredKeypaths) {
    var requiredKeypath = requiredKeypaths[i]
    if (!exists(keypather.get(instance, requiredKeypath))) {
      log.error(
        put({
          requiredKeypaths: requiredKeypaths,
          missingKeypath: requiredKeypath
        }, logData),
        'emitInstanceUpdate expects keypath exists'
      )
      throw new Error('emitInstanceUpdate malformed instance')
    }
  }

  this._emitInstanceUpdateAction(instance, action)
}

/**
 * emit instance delete event
 * @param  {object}   instance instance to send
 */
Messenger.prototype.emitInstanceDelete = function (instance) {
  log.trace({
    tx: true,
    instance: instance
  }, 'emitInstanceDelete')
  this._emitInstanceUpdateAction(instance, 'delete')
}

/**
 * emit instance update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 */
Messenger.prototype._emitInstanceUpdateAction = function (instance, action) {
  log.info({
    tx: true,
    instance: instance,
    action: action
  }, 'Messenger.prototype._emitInstanceUpdateAction')
  if (!instance) {
    log.fatal('_emitInstanceUpdateAction missing instance')
    throw new Error('emitInstanceUpdate missing instance')
  }
  this.messageRoom('org', instance.owner.github, {
    event: 'INSTANCE_UPDATE',
    action: action,
    data: instance
  })

  var instanceActionOpts = {
    instance: instance,
    timestamp: new Date().valueOf()
  }
  // this creates jobs that link uses
  if (action === 'delete') {
    rabbitMQ.instanceDeleted(instanceActionOpts)
  } else if (action === 'post') {
    rabbitMQ.instanceCreated(instanceActionOpts)
  } else {
    rabbitMQ.instanceUpdated(instanceActionOpts)
  }

  // Notify datadog of instance
  var runnableInstance = this.runnable.newInstance(instance)
  var status = runnableInstance.status()

  var statusToGuageMap = {}
  ;[
    'neverStarted',
    'unknown',
    'buildFailed',
    'crashed',
    'stopped',
    'building',
    'starting',
    'running',
    'stopping'
  ].reverse().forEach(function (status, index) {
    statusToGuageMap[status] = index;
  })

  var tags = [
    'shortHash:' + instance.shortHash,
    'repoName:' + keypather.get(instance, ''),
    'org:' + keypather.get(instance, 'owner.github'),
    'orgName:' + keypather.get(instance, 'owner.username'),
    'masterPod:' + instance.masterPod,
    'repo:' + runnableInstance.getRepoAndBranchName(),
    'name:' + instance.name
  ]

  dogstatsd.guage('instance.container.status', statusToGuageMap[status], tags)
  dogstatsd.guage('instance.container.migrating', runnableInstance.isMigrating() ? 0 : 1, tags)
}

/**
 * emit instnce update event
 * @param  {object}   contextVersion instance to send
 * @param  'string'   action   valid actions
 *   build_started, build_running, build_complete
 */
Messenger.prototype.emitContextVersionUpdate = function (contextVersion, action) {
  log.trace({
    tx: true,
    contextVersion: contextVersion._id,
    action: action
  }, 'emitContextVersionUpdate')
  var self = this
  if (contextVersion._doc) {
    delete contextVersion._doc.build.log
  } else {
    delete contextVersion.build.log
  }
  if (!contextVersion ||
    !keypather.get(contextVersion, 'createdBy.github') ||
    !keypather.get(contextVersion, 'owner.github') ||
    !action) {
    throw new Error('emitContextVersionUpdate missing inputs')
  }
  self.messageRoom('org', contextVersion.owner.github, {
    event: 'CONTEXTVERSION_UPDATE',
    action: action,
    data: contextVersion
  })
}

/**
 * Evaluates whether a user can join a stream-room or not
 * @param socket {Socket}
 * @param data {Object}
 * @param cb {Function} resolves with either true, or an error
 * @returns {*}
 */
Messenger.prototype.canJoin = function (socket, data, cb) {
  var logData = {
    tx: true,
    logName: data.name,
    type: data.type,
    action: data.action
  }
  log.info(logData, 'Messenger.prototype.canJoin')
  // auth token used when we connect from other server
  var authToken = keypather.get(socket, 'request.query.token')
  var userId = keypather.get(socket, 'request.session.passport.user')
  // github org or user id for personal accounts
  var accountId = data.name
  // always join room if we connected using `authToken`
  if (authToken) {
    log.info(logData, 'Messenger.prototype.canJoin: true with accessToken')
    return cb(null, true)
  }
  if (!userId) {
    log.error(logData, 'Messenger.prototype.canJoin: false without accessToken and userId')
    var unauthedError = error.create(401, 'No authentication data', data)
    keypather.set(unauthedError, 'data.level', 'warning')
    return cb(unauthedError)
  }
  User.findById(userId, function (err, user) {
    if (err) {
      log.error(logData, 'Messenger.prototype.canJoin: false when user fetch error')
      return cb(err)
    }
    if (!user) {
      log.error(logData, 'Messenger.prototype.canJoin: false when user fetch not found')
      return cb(Boom.notFound('User not found', { data: userId }))
    }
    // in this case user is joining room for his personal account
    if (user.accounts.github.id === accountId) {
      log.info(logData, 'Messenger.prototype.canJoin: true when user joins his/her room')
      return cb(null, true)
    }
    // find org and check membership
    user.findGithubOrgByGithubId(accountId, function (err, org) {
      if (err) {
        log.error(logData, 'Messenger.prototype.canJoin: false when org fetch error')
        return cb(err)
      }
      if (!org) {
        log.error(logData, 'Messenger.prototype.canJoin: false when org not found')
        return cb(Boom.notFound('Org not found', { data: accountId }))
      }
      var github = new GitHub({ token: user.accounts.github.accessToken })
      github.isOrgMember(org.login, cb)
    })
  })
}

/**
 * Handler for the room subscription socket.  Must use .bind() when calling this method
 * @param socket {Object} Primus socket for this session
 * @param id     {Number} Id of the stream
 * @param data   {Object} Data object from the socket initialization
 * @returns Promise with either a success, or a rejection if something fails
 */
Messenger.prototype.subscribeStreamHandler = function (socket, id, data) {
  dogstatsd.increment(baseDataName + '.connections')
  // check required args
  return Promise.try(function () {
    if (!data.name || !data.type || !data.action) {
      dogstatsd.increment(baseDataName + '.err.invalid_args')
      var notFound = error.create(400, 'name, type and action are required', data)
      keypather.set(notFound, 'data.level', 'warning')
      throw notFound
    }
  }).bind(this)
    .then(function () {
      if (~data.action.indexOf('join')) {
        return this.canJoinAsync(socket, data)
          // If you get rid of this bind, the following joinRoom's then will be the global then
          .bind(this)
          .then(function () {
            if (!socket.primus) {
              log.error({
                logName: data.name,
                type: data.type,
                action: data.action
              }, 'Socket\'s Primus was destroyed before the user could join')
            } else {
              this.joinRoom(socket, data.type, data.name)
            }
          })
          .catch(function () {
            var unauthedError = error.create(401, 'access denied', data)
            keypather.set(unauthedError, 'data.level', 'warning')
            throw unauthedError
          })
      } else if (~data.action.indexOf('leave')) {
        if (!socket.primus) {
          log.error({
            logName: data.name,
            type: data.type,
            action: data.action
          }, 'Socket\'s Primus was destroyed before the user could leave')
        } else {
          this.leaveRoom(socket, data.type, data.name)
        }
      } else {
        var badError = error.create(400, 'invalid action', data)
        keypather.set(badError, 'data.level', 'warning')
        throw badError
      }
    })
    .then(function () {
      roomActionComplete(socket, id, data)
    })
    .catch(function (err) {
      socket.write({
        id: id,
        error: err.message,
        data: data
      })
      throw err
    })
}

function roomActionComplete (socket, id, data) {
  log.trace({
    tx: true,
    logName: data.name,
    type: data.type,
    action: data.action
  }, 'roomActionComplete')
  socket.write({
    id: id,
    event: 'ROOM_ACTION_COMPLETE',
    data: {
      type: data.type,
      name: data.name,
      action: data.action
    }
  })
}

function genRoomName (type, name) {
  return process.env.MESSENGER_NAMESPACE + type + ':' + name
}

Promise.promisifyAll(Messenger)
Promise.promisifyAll(Messenger.prototype)
