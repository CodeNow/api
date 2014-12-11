'use strict';
var domain = require('domain');

var error = require('error');

var d = domain.create();
d.on('error', error.log);

function Events () {}

Events.prototype.listen = function (cb) {
  var self = this;
  d.run(function () {
    self.dockerEvents = require('./docker');
    self.dockerEvents.listen(cb);
  });
};

Events.prototype.close = function (cb) {
  if (this.dockerEvents) {
    this.dockerEvents.close(cb);
  }
  else {
    cb();
  }
};

module.exports = new Events();