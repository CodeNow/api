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

// var handleDockerDaemonDownEvent = handleDockerEvent.bind(dockerEvents.handleDockerDaemonDown);
// var handleDockerDaemonUpEvent = handleDockerEvent.bind(dockerEvents.handleDockerDaemonUp);


function listen (errorHandler) {
  // docker_down -> find all instances on that host(ip).
  // Find previous state.  If it was running call /instances/:id/actions/stop
  // messenger.on('runnable:docker:docker_daemon_down', handleDockerDaemonDownEvent);
  // // docker_up -> find all instances on that host(ip).
  // // Find previous state.  If it wasn't running call /instances/:id/actions/start
  // messenger.on('runnable:docker:docker_daemon_up', handleDockerDaemonUpEvent);
  // container die -> find container using id /instances/:id/actions/stop
  var dieEventName = process.env.DOCKER_EVENT_NAME_PREFIX + 'die';
  messenger.on(dieEventName, function (data) {
    handleDockerEvent(dockerEvents.handleContainerDie, errorHandler, data);
  });
}



// unsubscribe from the Redis
function cleanup () {
  // messenger.removeAllListeners('runnable:docker:docker_daemon_down',
  //  handleDockerDaemonDownEvent);
  // messenger.removeAllListeners('runnable:docker:docker_daemon_up',
  //  handleDockerDaemonUpEvent);
  var dieEventName = process.env.DOCKER_EVENT_NAME_PREFIX + 'die';
  messenger.removeAllListeners(dieEventName);
}

exports.listen = listen;
exports.cleanup = cleanup;