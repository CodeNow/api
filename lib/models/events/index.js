'use strict';
var messenger = require('../models/pubsub.js');
var dockerEvents = require('./docker.js');


function listen () {
  // docker_down -> find all instances on that host(ip). /instances/:id/actions/stop. and save state for each instance if it's not exist
  messenger.on('runnable:docker:docker_daemon_down', dockerEvents.handleDockerDown);
  // docker_up -> find all instances on that host(ip). Find previous state.  If it was running. /instances/:id/actions/start
  messenger.on('runnable:docker:docker_daemon_up', dockerEvents.handleDockerUp);
  // container die -> find container using id /instances/:id/actions/stop
  messenger.on('runnable:docker:die', dockerEvents.handleContainerDie);
}
// 1. api lock
// 2. owner lock
// 3. find state of container if running
// 4. if running - run cleanup and release lock


// scenario
// lock on event uuid
//
function cleanup () {
  messenger.removeAllListeners();
}

exports.listen = listen;
exports.cleanup = cleanup;