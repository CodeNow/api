/**
 * TODO document
 * @module lib/socket/messenger
 */
'use strict'
const Boom = require('dat-middleware').Boom
const exists = require('101/exists')
const keypather = require('keypather')()
const Promise = require('bluebird')
const uuid = require('uuid')

const dogstatsd = require('models/datadog')
const error = require('dat-middleware').Boom
const errorModule = require('error')
const GitHub = require('models/apis/github')
const logger = require('logger')
const rabbitMQ = require('models/rabbitmq')
const User = require('models/mongo/user')

module.exports = new Messenger()

const baseDataName = 'api.socket.messenger'
function Messenger () {}

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
  const log = logger.child({ logName: name, type: type, data: data })
  log.info('messageRoom')
  this.server.room(genRoomName(type, name)).write({
    id: uuid(),
    event: 'ROOM_MESSAGE',
    type,
    name,
    data
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
  const log = logger.child({ instance, action })
  log.info('Messenger.prototype.emitInstanceUpdate')
  if (!instance || !action) {
    log.fatal('emitInstanceUpdate missing instance or action')
    return
  }
  const requiredKeypaths = [
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
  for (let i in requiredKeypaths) {
    const requiredKeypath = requiredKeypaths[i]
    if (!exists(keypather.get(instance, requiredKeypath))) {
      log.error({
        requiredKeypaths: requiredKeypaths,
        missingKeypath: requiredKeypath
      }, 'emitInstanceUpdate expects keypath exists')

      // Report to rollbar
      const err = new Error('emitInstanceUpdate malformed instance')
      err.data = {
        instanceId: instance.id,
        missingKeypath: requiredKeypath,
        requiredKeypaths: requiredKeypaths
      }
      errorModule.log(err)

      // Stop early.
      return
    }
  }

  this._emitInstanceUpdateAction(instance, action)
}

/**
 * emit instance delete event
 * @param  {object}   instance instance to send
 */
Messenger.prototype.emitInstanceDelete = function (instance) {
  const log = logger.child({ instance })
  log.info('Messenger.prototype.emitInstanceDelete')
  this._emitInstanceUpdateAction(instance, 'delete')
}

/**
 * emit instance update event
 * @param  {object}   instance instance to send
 * @param  'string'   action   valid actions
 */
Messenger.prototype._emitInstanceUpdateAction = function (instance, action) {
  const log = logger.child({ instance, action })
  log.info('Messenger.prototype._emitInstanceUpdateAction')

  if (!instance) {
    log.fatal('_emitInstanceUpdateAction missing instance')
    return
  }
  this.messageRoom('org', instance.owner.github, {
    event: 'INSTANCE_UPDATE',
    action,
    data: instance
  })
  const jsonInstance = instance.toJSON ? instance.toJSON() : instance
  const instanceId = keypather.get(instance, '_id.toString()')
  jsonInstance._id = instanceId
  const instanceActionOpts = {
    instance: jsonInstance,
    timestamp: new Date().valueOf()
  }
  // this creates jobs that link uses
  try {
    if (action === 'delete') {
      rabbitMQ.instanceDeleted(instanceActionOpts)
    } else if (action === 'post') {
      rabbitMQ.instanceCreated(instanceActionOpts)
    } else if (action === 'isolation') {
      // TODO: future event goes here
    } else {
      rabbitMQ.instanceUpdated(instanceActionOpts)
    }
  } catch (err) {
    log.error({ err: err, instanceActionOpts, instanceId, action }, 'failed to publish new job')
  }
}

/**
 * emit instance update event
 * @param  {object}   contextVersion instance to send
 * @param  'string'   action   valid actions
 *   build_started, build_running, build_complete
 */
Messenger.prototype.emitContextVersionUpdate = function (contextVersion, action) {
  const log = logger.child({ contextVersion: contextVersion, action: action })
  log.info('Messenger.prototype.emitContextVersionUpdate')

  const self = this
  if (contextVersion._doc) {
    delete contextVersion._doc.build.log
  } else {
    delete contextVersion.build.log
  }
  if (!contextVersion ||
    !keypather.get(contextVersion, 'createdBy.github') ||
    !keypather.get(contextVersion, 'owner.github') ||
    !action
  ) {
    log.fatal('emitContextVersionUpdate missing inputs')
    return
  }
  self.messageRoom('org', contextVersion.owner.github, {
    event: 'CONTEXTVERSION_UPDATE',
    action: action,
    data: contextVersion
  })
}

/**
 * emit first dock created event for the github account
 * @param  {Number}   githubId - github account id
 */
Messenger.prototype.emitFirstDockCreated = function (githubId) {
  logger.trace({ githubId: githubId }, 'Messenger.prototype.emitFirstDockCreated')
  this.messageRoom('org', githubId, {
    event: 'FIRST_DOCK_CREATED',
    action: 'dock.created'
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
  const log = logger.child({
    logName: data.name,
    type: data.type,
    action: data.action,
    method: 'Messenger.prototype.canJoin'
  })
  log.info('Messenger.prototype.canJoin called')
  // auth token used when we connect from other server
  const authToken = keypather.get(socket, 'request.query.token')
  const userId = keypather.get(socket, 'request.session.passport.user')
  // github org or user id for personal accounts
  const accountId = data.name
  // always join room if we connected using `authToken`
  if (authToken) {
    log.trace('true with accessToken')
    return cb(null, true)
  }
  if (!userId) {
    log.error('false without accessToken and userId')
    const unauthedError = error.create(401, 'No authentication data', data)
    keypather.set(unauthedError, 'data.level', 'warning')
    return cb(unauthedError)
  }
  User.findById(userId, function (err, user) {
    if (err) {
      log.error('false when user fetch error')
      return cb(err)
    }
    if (!user) {
      log.error('false when user fetch not found')
      return cb(Boom.notFound('User not found', { data: userId }))
    }
    // in this case user is joining room for his personal account
    if (user.accounts.github.id === accountId) {
      log.trace('true when user joins his/her room')
      return cb(null, true)
    }
    // find org and check membership
    user.findGithubOrgByGithubId(accountId, function (err, org) {
      if (err) {
        log.error('false when org fetch error')
        return cb(err)
      }
      if (!org) {
        log.error('false when org not found')
        return cb(Boom.notFound('Org not found', { data: accountId }))
      }
      const github = new GitHub({ token: user.accounts.github.accessToken })
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
      const notFound = error.create(400, 'name, type and action are required', data)
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
              logger.error({
                logName: data.name,
                type: data.type,
                action: data.action
              }, 'Socket\'s Primus was destroyed before the user could join')
            } else {
              this.joinRoom(socket, data.type, data.name)
            }
          })
          .catch(function () {
            const unauthedError = error.create(401, 'access denied', data)
            keypather.set(unauthedError, 'data.level', 'warning')
            throw unauthedError
          })
      } else if (~data.action.indexOf('leave')) {
        if (!socket.primus) {
          logger.error({
            logName: data.name,
            type: data.type,
            action: data.action
          }, 'Socket\'s Primus was destroyed before the user could leave')
        } else {
          this.leaveRoom(socket, data.type, data.name)
        }
      } else {
        const badError = error.create(400, 'invalid action', data)
        keypather.set(badError, 'data.level', 'warning')
        throw badError
      }
    })
    .then(function () {
      roomActionComplete(socket, id, data)
    })
    .catch(function (err) {
      socket.write({
        id,
        error: err.message,
        data
      })
      throw err
    })
}

function roomActionComplete (socket, id, data) {
  logger.trace({
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
