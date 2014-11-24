'use strict';
var messenger = require('../models/pubsub.js');
var dockerEvents = require('./docker.js');


// TODO (anton) implement lock on message.uuid
// Lock is needed to ensure that same message is going to be processed only once
function listen () {
  // docker_down -> find all instances on that host(ip).
  // Find previous state.  If it was running call /instances/:id/actions/stop
  messenger.on('runnable:docker:docker_daemon_down', dockerEvents.handleDockerDaemonDown);
  // docker_up -> find all instances on that host(ip).
  // Find previous state.  If it wasn't running call /instances/:id/actions/start
  messenger.on('runnable:docker:docker_daemon_up', dockerEvents.handleDockerDaemonUp);
  // container die -> find container using id /instances/:id/actions/stop
  messenger.on('runnable:docker:die', dockerEvents.handleContainerDie);
}



// unsubscribe from the Redis
function cleanup () {
  messenger.removeListener('runnable:docker:docker_daemon_down',
    dockerEvents.handleDockerDaemonDown);
  messenger.removeListener('runnable:docker:docker_daemon_up',
    dockerEvents.handleDockerDaemonUp);
  messenger.removeListener('runnable:docker:die',
    dockerEvents.handleContainerDie);
}

exports.listen = listen;
exports.cleanup = cleanup;