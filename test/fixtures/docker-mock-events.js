'use strict';

var ContextVersion = require('models/mongo/context-version');
var dockerMock = require('docker-mock');

var extend = require('extend');
var keypather = require('keypather')();
module.exports.emitBuildComplete = emitBuildComplete;
module.exports.emitBuildStart = emitBuildStart;

function emitBuildComplete (cv, failure) {
  if (cv.toJSON) {
    cv = cv.toJSON();
  }
  var containerId = cv.build && cv.build.dockerContainer;
  if (!containerId) {
    ContextVersion.findById(cv._id, function (err, cv) {
      if (err) { throw err; }
      emitBuildComplete(cv, failure);
    });
    return;
  }
  require('./mocks/docker/build-logs.js')(failure);
  dockerMock.events.stream.emit('data',
    JSON.stringify({
      status: 'die',
      from: process.env.DOCKER_IMAGE_BUILDER_NAME+':'+process.env.DOCKER_IMAGE_BUILDER_VERSION,
      id: containerId
    }));
}

function emitBuildStart (cv) {
  if (cv.toJSON) {
    cv = cv.toJSON();
  }
  var result = require('../../unit/fixtures/docker-listener/build-image-container');

  var Labels = keypather.flatten(cv, '.', 'contextVersion');
  extend(result, Labels);
  dockerMock.events.stream.emit('data',
    JSON.stringify(result));
}
