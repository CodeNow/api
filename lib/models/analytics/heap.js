'use strict';
var request = require('request');
var noop = require('101/noop');

exports.track = function (githubId, eventName, eventData, cb) {
  cb = cb || noop;
  var body = {
    identity: 'github-' + githubId,
    app_id: process.env.HEAP_APP_ID,
    'event': eventName,
    properties: eventData
  };
  var opts = {
    url: 'https://heapanalytics.com/api/track',
    method: 'POST',
    json: true,
    body: body
  };
  request(opts, cb);
};