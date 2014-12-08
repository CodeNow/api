'use strict';
var Instance = require('models/mongo/instance');
var UserStoppedContainer = require('models/redis/user-stopped-container');
var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events:docker');

var messenger = require('models/redis/pubsub');
var DockerEventMutex = require('models/redis/docker-event-mutex');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events');
var error = require('error');

/**
 * Handle container `die` event.
 * @param data is raw json object received from docker-listener.
 * `data` should always have `uuid`, `host`, `time`, `id`, `status`, `from` fields.
 */
function handleContainerDie (data, cb) {
  debug('handle container die');

  cb = cb || noop;
  var containerId = data.id;
  if (!containerId) {
    return cb(Boom.badRequest('Invalid data: container id is missing', { debug: data }));
  }
  if (!data.time) {
    return cb(Boom.badRequest('Invalid data: time is missing', { debug: data }));
  }
  if (!data.host) {
    return cb(Boom.badRequest('Invalid data: host is missing', { debug: data }));
  }
  var host = data.host;
  var userStoppedContainer = new UserStoppedContainer(containerId);
  userStoppedContainer.lock(function (err, stoppedByUser) {
    if (err) { return cb(err); }
    // don't do anything
    if (!stoppedByUser) {
      // we skipped `die` event once. Now remove flag.
      userStoppedContainer.unlock(function (err) {
        if (err) { return cb(err); }
        return cb(Boom.conflict('Event is being handled by another subsystem', { debug: data }));
      });
    } else {
      // 1. find latest instance inspect
      // 2. update `Instance.container.inspect`
      Instance.findByContainerId(containerId, function (err, instance) {
        if (err) { return cb(err); }
        if (!instance) {
          return cb(Boom.notFound('Instance was not found', { debug: data }));
        }
        instance.inspectAndUpdate(instance.container, host, cb);
      });
    }
  });
}

function handleDockerEvent (successHandler, errorHandler, data) {
  debug('handle docker event', data);
  errorHandler = errorHandler || error.log;
  var uuid = data.uuid;
  if (!uuid) {
    return errorHandler(Boom.badRequest('Invalid data: uuid is missing', { debug: data }));
  }
  // Lock is needed to ensure that same message is going to be processed only once
  // E.x. we might have two or more API server. We want them to process message only once
  var mutex = new DockerEventMutex(uuid);
  mutex.lock(function (err, success) {
    if (err) {
      errorHandler(err);
    }
    else if (!success) {
      errorHandler(Boom.conflict('Event is being handled by another API host.', { debug: data }));
    }
    else {
      successHandler(data, function (err) {
        if (err){
          // DO NOT RETURN, log error and continue to unlock.
          errorHandler(err);
        }
        mutex.unlock(function (err) {
          if (err) { return errorHandler(err); }
          debug('unlocked', uuid);
        });
      });
    }
  });
}

function cleanup () {
  var dieEventName = process.env.DOCKER_EVENTS_NAMESPACE + 'die';
  messenger.removeAllListeners(dieEventName);
}

function listen (errorHandler) {
  var dieEventName = process.env.DOCKER_EVENTS_NAMESPACE + 'die';
  messenger.on(dieEventName, function (data) {
    handleDockerEvent(handleContainerDie, errorHandler, data);
  });
}

exports.handleContainerDie = handleContainerDie;
exports.listen = listen;
exports.cleanup = cleanup;
