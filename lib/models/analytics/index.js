'use strict';
var heap = require('./heap');


function Ananlytics () {}

Ananlytics.prototype.track = function (githubUserId, event, eventData, cb) {
  heap.track(githubUserId, event, eventData, cb);
};


module.exports = Ananlytics;