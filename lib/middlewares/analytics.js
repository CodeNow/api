'use strict';
var heap = require('models/analytics/heap');


/*jshint maxcomplexity:8*/
module.exports = {
  track: function (githubUserId, event, eventData) {
    return function (req, res, next) {
      if (process.env.ENABLE_SERVER_SIDE_ANALYTICS === 'true') {
        // don't wait for heap response
        heap.track(githubUserId, event, eventData);
      }
      next();
    };
  }
};