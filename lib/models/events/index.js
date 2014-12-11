'use strict';
var dockerEvents = require('./docker');
var domain = require('domain');

var error = require('error');

var d = domain.create();

d.on('error', error.log);

function Events () {}

Events.prototype.listen = function (cb) {
  d.run(function () {
    dockerEvents.listen(cb);
  })
};

Events.prototype.close = function (cb) {
  dockerEvents.close(cb);
};

module.exports = new Events();