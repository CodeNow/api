'use strict';
var request = require('request');
var noop = require('101/noop');
var async = require('async');

function Heap () {}

Heap.prototype.track = function (githubId, eventName, eventData, userData, cb) {
  cb = cb || noop;
  if (!process.env.HEAP_APP_ID) {
    cb(null);
  }
  else {
    async.parallel([
      track.bind(null, githubId, eventName, eventData),
      identify.bind(null, githubId, userData)
    ], cb);
  }
};

function track (githubId, eventName, eventData, callback) {
  eventData = eventData || {};
  eventData.domain = process.env.DOMAIN_HOST;
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
  request(opts, callback);
}

function identify (githubId, userData, callback) {
  userData = userData || {};
  if (Object.keys(userData) === 0) {
    return callback(null);
  }
  var body = {
    app_id: process.env.HEAP_APP_ID,
    properties: userData
  };
  // if githubId was provided -> use prefixed version as unique identifier
  if (githubId) {
    body.identity = 'github-' + githubId;
  }
  var opts = {
    url: 'https://heapanalytics.com/api/identify',
    method: 'POST',
    json: true,
    body: body
  };
  request(opts, callback);
}

module.exports = Heap;