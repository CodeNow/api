'use strict';
var dockerEvents = require('./docker');

function listen () {
  dockerEvents.listen();
}
// unsubscribe from the Redis
function cleanup () {
  dockerEvents.cleanup();
}

exports.listen = listen;
exports.cleanup = cleanup;