'use strict';
var Instance = require('models/mongo/instance');
var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');

var UserStoppedContainer = require('models/redis/user-stopped-container');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events:docker');

var messenger = require('models/redis/pubsub');
var DockerEventMutex = require('models/redis/docker-event-mutex');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events:docker');
var error = require('error');
var noop = require('101/noop');
var activeApi = require('models/redis/active-api');

function DockerEvents () {
  this.events = {
    'die': this.handleDie.bind(this)
  };
  this.eventLockCount = 0;
}

DockerEvents.prototype.listen = function (cb) {
  debug('listen', arguments);
  cb = cb || noop;
  if (this.closeHandler) {
    return cb(Boom.conflict('closing events listener is in progress'));
  }
  this.subscribeAll();
  cb();
};

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
  debug('decLockCount', arguments);
  this.eventLockCount--;
  if (this.closeHandler && this.eventLockCount <= 0) {
    this.eventLockCount = 0; // to be safe
    this.closeHandler();
    delete this.closeHandler;
  }
};

DockerEvents.prototype.subscribeAll = function () {
  debug('subscribeAll', arguments);
  var self = this;
  Object.keys(this.events)
    .forEach(function (eventName) {
      var fullEventName = process.env.DOCKER_EVENTS_NAMESPACE + eventName;
      var handler = self.events[eventName];
      messenger.on(fullEventName, handler);
    });
};

DockerEvents.prototype.unsubscribeAll = function () {
  debug('unsubscribeAll', arguments);
  var self = this;
  var dieEventName = process.env.DOCKER_EVENTS_NAMESPACE + 'die';
  messenger.removeAllListeners(dieEventName);
  Object.keys(this.events)
    .forEach(function (eventName) {
      var fullEventName = process.env.DOCKER_EVENTS_NAMESPACE + eventName;
      var handler = self.events[eventName];
      messenger.removeListener(fullEventName, handler);
    });
};

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

DockerEvents.prototype.handleDie = function (data) {
  debug('handleDie', arguments);
  // this api is closing and will not handle any new events.
  if (this.closeHandler) {
    // this debug statement is covered with unit test. Don't change/remove it.
    // see unit/docker-events.js
    return debug('events are stopping');
  }
  var self = this;
  var errDebug = {
    event: 'die',
    data: data
  };
  var err = validateDieEventData(data);
  if (err) {
    return logErr(err);
  }
  var containerId = data.id;
  activeApi.isMe(function (err, meIsActiveApi) {
    if (err) { return logErr(err); }
    if (!meIsActiveApi) {
      // this debug statement is covered with unit test. Don't change/remove it.
      // see unit/docker-events.js
      return debug('not active api');
    }
    self.getEventLock(data.uuid, function (err, eventMutex) {
      if (err) { return logErr(err); }

      if (isImageBuilder(data)) {
        return handleImageComplete(data);
      }

      var userStoppedContainer = new UserStoppedContainer(containerId);
      userStoppedContainer.lock(function (err, success) {
        if (err) { return unlockAndLogErr(eventMutex, err); }
        var stoppedByUser = !success;
        if (stoppedByUser) {
          eventMutex.unlock(logIfErr);
          userStoppedContainer.unlock(logIfErr);
        }
        else {
          Instance.inspectAndUpdateByContainer(containerId, function (err) {
            logIfErr(err); // log error and continue
            eventMutex.unlock(logIfErr);
            userStoppedContainer.unlock(logIfErr);
          });
        }
      });
    });
  });

  function logErr (err) {
    if (err.isBoom) {
      err.data = {
        debug: errDebug
      };
    }
    error.log(err);
  }
  function logIfErr (err) {
    if (err) {
      logErr(err);
    }
  }
  function unlockAndLogErr (mutex, err) {
    mutex.unlock(logIfErr);
    error.log(err);
  }
};

function handleImageComplete (data) {
  // find context by id
  // retry if no started
  var name = data.containerInspect.name.replace('/', '');
  var retry = process.env.IMAGE_RETRY_COUNT;
  handle();
  function handle () {
    ContextVersion.findByBuildId(name, function(err, cv) {
      if (err) { return  error.log(err); }
      retry--;
      // there is a race between when we called start on container and when we save to db
      // retry should fix this
      if (cv && cv.length === 0) {
        if (retry > 0) {
          return error.log(new Error('can not find context version with buildId'));
        } else {
          return setTimeout(handle, process.env.IMAGE_RETRY_MS);
        }
      }
      // get logs
      var docker = new Docker(data.host);
      docker.getBuildInfo(name, function(err, buildData) {
        if (err) { return  error.log(err); }
        // set build complete
        cv.setBuildCompleted(buildData, function(err) {
          if (err) { return  error.log(err); }
        });
      });
      // push to reg
      var split = cv.dockerTag.split(':');
      var imageName = split[0];
      var imageTag  = split[1];
      docker.pushImageToRegistry(imageName, imageTag);
    });
  }
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

// Singleton
module.exports = new DockerEvents();