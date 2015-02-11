'use strict';

var dockerMock = require('docker-mock');

module.exports.emitBuildComplete = function (cv) {
  if (!cv.fetch) {
    throw new Error('cv needs to be a model');
  }
  cv.fetch(function(err, cv) {
    if (!cv.containerId || !cv.build._id) {
      throw new Error('cv is missing containerId id or build._id');
    }
    dockerMock.events.stream.emit('data',
      JSON.stringify({
        status: 'die',
        from: process.env.DOCKER_IMAGE_BUILDER_NAME,
        id: cv.containerId
      }));
  });
};


