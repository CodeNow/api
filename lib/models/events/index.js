'use strict';
var dockerEvents = require('./docker');

function Events () {}

Events.prototype.listen = function (cb) {
  dockerEvents.listen(cb);
};

Events.prototype.close = function (cb) {
  dockerEvents.close(cb);
};

module.exports = new Events();