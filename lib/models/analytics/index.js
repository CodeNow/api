'use strict';
var heap = require('./heap');


function Ananlytics () {}

Ananlytics.prototype.track = function (githubUserId, event, eventData, cb) {
  if (process.env.ENABLE_SERVER_SIDE_ANALYTICS !== 'true') {
    cb(null);
  }
  else {
    heap.track(githubUserId, event, eventData, cb);
  }
};


module.exports = Ananlytics;