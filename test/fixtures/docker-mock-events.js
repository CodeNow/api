'use strict';

var ContextVersion = require('models/mongo/context-version');
var dockerMock = require('docker-mock');

module.exports.emitBuildComplete = emitBuildComplete;

function emitBuildComplete (cv, failure) {
  if (cv.toJSON) {
    cv = cv.toJSON();
  }
  var containerId = cv.build && cv.build.dockerContainer;
  if (!containerId) {
    ContextVersion.findById(cv._id, function (err) {
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
