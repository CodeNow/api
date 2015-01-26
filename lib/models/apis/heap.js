'use strict';
var request = require('request');
var noop = require('101/noop');

function Heap () {}

Heap.prototype.track = function (githubId, eventName, eventData, cb) {
  cb = cb || noop;
  if (!process.env.HEAP_APP_ID) {
    cb(null);
  }
  else {
    eventData = eventData || {};
    eventData.domain = process.env.DOMAIN;
    var body = {
      app_id: process.env.HEAP_APP_ID,
      'event': eventName,
      properties: eventData
    };
    // if githubId was provided -> use prefixed version as unique identifier
    if (githubId) {
      body.identity = 'github-' + githubId;
    }
    var opts = {
      url: 'https://heapanalytics.com/api/track',
      method: 'POST',
      json: true,
      body: body
    };
    request(opts, cb);
  }
};

module.exports = Heap;