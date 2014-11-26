'use strict';
var messenger = require('models/pubsub.js');
var dockerEvents = require('./docker.js');
var RedisMutex = require('models/redis/mutex');
var error = require('error');
var debug = require('debug')('runnable-api:events');

function handleDockerEvent (successHandler, data) {
  var uuid = data.uuid;
  // Lock is needed to ensure that same message is going to be processed only once
  // E.x. we might have two or more API server. We want them to process message only once
  var mutex = new RedisMutex(uuid);
  mutex.lock(function (err, success) {
    if (err) {
      error.log(err);
    } else if (!success) {
      error.log(err);
    } else {
      successHandler(data, function () {
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
var handleContainerDieEvent = handleDockerEvent.bind(dockerEvents.handleContainerDie);


function listen () {
  // docker_down -> find all instances on that host(ip).
  // Find previous state.  If it was running call /instances/:id/actions/stop
  // messenger.on('runnable:docker:docker_daemon_down', handleDockerDaemonDownEvent);
  // // docker_up -> find all instances on that host(ip).
  // // Find previous state.  If it wasn't running call /instances/:id/actions/start
  // messenger.on('runnable:docker:docker_daemon_up', handleDockerDaemonUpEvent);
  // container die -> find container using id /instances/:id/actions/stop
  messenger.on('runnable:docker:die', handleContainerDieEvent);
}



// unsubscribe from the Redis
function cleanup () {
  // messenger.removeListener('runnable:docker:docker_daemon_down', handleDockerDaemonDownEvent);
  // messenger.removeListener('runnable:docker:docker_daemon_up', handleDockerDaemonUpEvent);
  messenger.removeListener('runnable:docker:die', handleContainerDieEvent);
}

exports.listen = listen;
exports.cleanup = cleanup;