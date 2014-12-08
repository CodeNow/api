'use strict';
var messenger = require('models/redis/pubsub');
var dockerEvents = require('./docker');
var RedisMutex = require('models/redis/mutex');
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('runnable-api:events');
var error = require('error');

function handleDockerEvent (successHandler, errorHandler, data) {
  debug('handle docker event', data);
  errorHandler = errorHandler || error.log;
  var uuid = data.uuid;
  // Lock is needed to ensure that same message is going to be processed only once
  // E.x. we might have two or more API server. We want them to process message only once
  var mutex = new RedisMutex(uuid);
  mutex.lock(function (err, success) {
    if (err) {
      errorHandler(err);
    }
    else if (success < 1) {
      errorHandler(Boom.conflict('Event is being handled by another API host.', { debug: data }));
    }
    else {
      successHandler(data, function (err) {
        if (err) {
          errorHandler(err);
        }
        mutex.unlock(function () {
          // log message
          debug('unlocked', uuid);
        });
      });
    }
  });
}

function listen (errorHandler) {

  var dieEventName = process.env.DOCKER_EVENT_NAME_PREFIX + 'die';
  messenger.on(dieEventName, function (data) {
    handleDockerEvent(dockerEvents.handleContainerDie, errorHandler, data);
  });
}



// unsubscribe from the Redis
function cleanup () {
  var dieEventName = process.env.DOCKER_EVENT_NAME_PREFIX + 'die';
  messenger.removeAllListeners(dieEventName);
}

exports.listen = listen;
exports.cleanup = cleanup;