'use strict';
var messenger = require('../models/pubsub.js');
var dockerEvents = require('./docker.js');

function listen () {
  messenger.on('runnable:docker:docker_daemon_down', dockerEvents.handleDockDown);
  messenger.on('runnable:docker:docker_daemon_up', dockerEvents.handleDockUp);
}

module.exports.listen = listen;