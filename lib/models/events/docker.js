/**
 * @module lib/models/events/docker
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events:docker');
var noop = require('101/noop');

var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var DockerEventMutex = require('models/redis/docker-event-mutex');
var Instance = require('models/mongo/instance');
var Sauron = require('models/apis/sauron.js');
var UserStoppedContainer = require('models/redis/user-stopped-container');
var activeApi = require('models/redis/active-api');
var dogstatsd = require('models/datadog');
var error = require('error');
var formatArgs = require('format-args');
var pubsub = require('models/redis/pubsub');

/**
 * @class
 */
function DockerEvents () {
  // docker events and handlers
  this.events = {
    die: this.handleDie.bind(this)
  };
  this.eventLockCount = 0;
}

/**
 * Bind event callbacks to all events registered to this.events
 * Enforce invoked once
 * @param {Function} cb
 */
DockerEvents.prototype.listen = function (cb) {
  debug('listen', arguments);
  cb = cb || noop;
  if (this.closeHandler) {
    return cb(Boom.conflict('closing events listener is in progress'));
  }
  this.subscribeAll();
  cb();
};

/**
 * Cease listening to events from docks
 * @param {Function} cb
 */
DockerEvents.prototype.close = function (cb) {
  debug('close', arguments, this.eventLockCount);
  cb = cb || noop;
  if (this.closeHandler) {
    return cb(Boom.conflict('already closing events listener'));
  }
  var self = this;
  this.unsubscribeAll();
  this.closeHandler = cb;
  if (this.eventLockCount <= 0) {
    this.eventLockCount = 0; // to be safe
    // prevent sync callback
    process.nextTick(function () {
      self.closeHandler();
      delete self.closeHandler;
    });
  }
};

DockerEvents.prototype.decLockCount = function () {
  debug('decLockCount', this.eventLockCount);
  this.eventLockCount--;
  if (this.closeHandler && this.eventLockCount <= 0) {
    debug('this.closeHandler');
    this.eventLockCount = 0; // to be safe
    this.closeHandler();
    delete this.closeHandler;
  }
};

/**
 * Bind handlers to docker events w/ prefixed event names
 * @param {String} name
 * @param {Function} handler
 */
DockerEvents.prototype.on = function (name, handler) {
  name = process.env.DOCKER_EVENTS_NAMESPACE + name;
  debug('DockerEvents.on - ' + name);
  pubsub.on(name, handler);
};

DockerEvents.prototype.once = function (name, handler) {
  name = process.env.DOCKER_EVENTS_NAMESPACE + name;
  pubsub.once(name, handler);
};

DockerEvents.prototype.removeListener = function (name, handler) {
  name = process.env.DOCKER_EVENTS_NAMESPACE + name;
  pubsub.removeListener(name, handler);
};

/**
 * Bind handlers to all events for keys of this.events
 */
DockerEvents.prototype.subscribeAll = function () {
  debug('subscribeAll', arguments);
  var self = this;
  Object.keys(this.events)
    .forEach(function (eventName) {
      var handler = self.events[eventName];
      debug('subscribe', eventName);
      self.on(eventName, handler);
    });
};

DockerEvents.prototype.unsubscribeAll = function () {
  debug('unsubscribeAll', arguments);
  var self = this;
  var dieEventName = process.env.DOCKER_EVENTS_NAMESPACE + 'die';
  pubsub.removeAllListeners(dieEventName);
  Object.keys(this.events)
    .forEach(function (eventName) {
      var handler = self.events[eventName];
      self.removeListener(eventName, handler);
    });
};

/**
 * Use redis key/value store to ensure only one API process
 * handles an event
 * @param {String} eventId
 * @param {Function} cb
 */
DockerEvents.prototype.getEventLock = function (eventId, cb) {
  debug('getEventLock', arguments);
  var self = this;
  var mutex = new DockerEventMutex(eventId);
  var wrappedMutex = {
    unlock: wrappedUnlock
  };
  this.eventLockCount++;
  mutex.lock(function (err, success) {
    if (err) {
      self.decLockCount();
      cb(err);
    }
    else if (!success) {
      self.decLockCount();
      cb(Boom.conflict('Event is being handled by another API host.'));
    }
    else {
      // don't decrement here..
      cb(null, wrappedMutex);
    }
  });
  function wrappedUnlock (cb) {
    mutex.unlock(function (err) {
      self.decLockCount(); // above error to be safe..
      if (err) { return cb(err); }
      cb();
    });
  }
};

/**
 * Docker 'die' event handler
 * Invoked when a container dies on a dock
 * @param {Object} data
 */
DockerEvents.prototype.handleDie = function (data) {
  debug('handleDie', arguments);
  // this api is closing and will not handle any new events.
  if (this.closeHandler) {
    // this debug statement is covered with unit test. Don't change/remove it.
    // see unit/docker-events.js
    return debug('events are stopping');
  }
  var err = validateDieEventData(data);
  if (err) {
    return logErr(err, data);
  }
  // NOTE: Future task to move to rabbitmq
  activeApi.isMe(function (err, meIsActiveApi) {
    if (err) { return logErr(err, data); }
    if (!meIsActiveApi) {
      // this debug statement is covered with unit test. Don't change/remove it.
      // see unit/docker-events.js
      return debug('not active api');
    }
    debug('active api, handling event');
    this.getEventLock(data.uuid, function (err, eventMutex) {
      debug('getEventLock response', formatArgs(arguments));
      if (err) { return logErr(err, data); }
      if (isImageBuilder(data)) {
        handleImageBuilderDie(data, function (err) {
          logIfErr(err, data);
          eventMutex.unlock(logIfErr(data));
        });
      }
      else {
        handleInstanceContainerDie(data, function (err) {
          logIfErr(err, data);
          eventMutex.unlock(logIfErr(data));
        });
      }
    });
  }.bind(this));
};

/**
 * handle instance container die event (might not be attached to anything)
 * @param  {object}   data container die event data
 * @param  {Function} cb   callback
 */
function handleInstanceContainerDie (data, cb) {
  var containerId = data.id;
  var userStoppedContainer = new UserStoppedContainer(containerId);
  userStoppedContainer.lock(function (err, success) {
    if (err) { return cb(err); }
    var stoppedByUser = !success;
    if (stoppedByUser) {
      return unlockAndCallback();
    }

    Instance.inspectAndUpdateByContainer(containerId, function (err, instance) {
      if (err) { return unlockAndCallback(err); }
      if (!instance) {
        return unlockAndCallback();
      }
      instance.emitInstanceUpdate('container_inspect', unlockAndCallback);
    });
  });
  function unlockAndCallback (err) {
    userStoppedContainer.unlock(logIfErr(data));
    cb(err);
  }
}

function logErr (err, data) {
  if (err.isBoom) {
    err.data = {
      event: 'die',
      data: data
    };
  }
  error.log(err);
}

/**
 * logIfErr - supports partial functionality
 * @param  {object} data  event data
 * @param  {error}  [err] error
 * @return {function} if err is not provided it is a function that accepts error
 */
function logIfErr (data) {
  function check (err) {
    if (err) {
      logErr(err, data);
    }
  }
  if (arguments.length === 2) {
    check(arguments[0]);
  }
  else {
    return check;
  }
}

/**
 * handle image-builder container die event
 * @param  {object}   data container die event data
 * @param  {Function} cb   callback
 */
function handleImageBuilderDie (data, cb) {
  debug('handleImageBuilderDie', data);
  // find context by id
  // retry if no started
  var containerId = data.id;
  dogstatsd.increment('api.events.docker.die.builder', ['id:'+containerId]);
  ContextVersion.findOneBy('build.dockerContainer', containerId, function (err, cv) {
    if (err) { return cb(err); }
    if (!cv) {
      err = Boom.notFound('Image-builder context versions not found', {
        containerId: containerId
      });
      return cb(err);
    }
    getBuildInfo(cv.dockerHost, containerId, cb);
    // do in backround
    deallocNetwork(cv, logIfErr);
  });
  function getBuildInfo (dockerHost, containerId, cb) {
    debug('getBuildInfo');
    var origCb = cb;
    cb = function () {
      origCb.apply(null, arguments);
      buildHistory.save(logIfErr);
    };

    var docker = new Docker(dockerHost);
    docker.getBuildInfo(containerId, function (err, buildInfo) {

      buildHistory.updateBuildInfo(buildInfo);

      debug('docker.getBuildInfo callback');
      if (err) { return updateBuildError(containerId, err, cb); }
      if (buildInfo.failed) {
        updateBuildError(containerId, buildInfo, cb);
      }
      else {
        debug('set build complete success', buildInfo);
        // updateBuildCompleted
        ContextVersion.updateBuildCompletedByContainer(containerId, buildInfo, cb);
      }
    });
  }
  function updateBuildError (containerId, buildInfo, cb) {
    debug('set build failed', buildInfo);
    // data.inspectData could be missing...
    var errorCode = data.inspectData ? data.inspectData.errorcode : '?';
    var err = Boom.badRequest('Building dockerfile failed with errorcode: '+errorCode, {
      docker: {
        containerId: containerId,
        log        : buildInfo.log
      }
    });
    ContextVersion.updateBuildErrorByContainer(containerId, err, cb);
  }
}

function deallocNetwork (cv, cb) {
  Sauron.deleteHostFromContextVersion(cv, cb);
}

function isImageBuilder (data) {
  return ~data.from.indexOf(process.env.DOCKER_IMAGE_BUILDER_NAME);
}

function validateDieEventData (data) {
  /*jshint maxcomplexity:6*/
  if (!data.uuid) {
    return Boom.badRequest('Invalid data: uuid is missing');
  }
  if (!data.id) {
    return Boom.badRequest('Invalid data: container id is missing');
  }
  if (!data.time) {
    return Boom.badRequest('Invalid data: time is missing');
  }
  if (!data.host) {
    return Boom.badRequest('Invalid data: host is missing');
  }
  if (!data.from) {
    return Boom.badRequest('Invalid data: from is missing');
  }
}

module.exports = new DockerEvents();
