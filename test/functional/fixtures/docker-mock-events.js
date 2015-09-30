'use strict';

var ContextVersion = require('models/mongo/context-version');
var Instance = require('models/mongo/instance');
var dockerMock = require('docker-mock');
var isObject = require('101/is-object');

module.exports.emitBuildComplete = emitBuildComplete;
module.exports.emitContainerDie = emitContainerDie;

function emitBuildComplete (cv, user, failure) {
  if (arguments.length >= 2 && !isObject(user)) {
    throw new Error('missing arguments');
  }
  if (cv.toJSON) {
    cv = cv.toJSON();
  }
  require('./mocks/github/user')(user);
  var containerId = cv.build && cv.build.dockerContainer;
  if (!containerId) {
    ContextVersion.findById(cv._id, function (err, cv) {
      if (err) { throw err; }
      emitBuildComplete(cv, user, failure);
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
function emitContainerDie (instance) {
  if (instance.toJSON) {
    instance = instance.toJSON();
  }
  var containerId = instance.container && instance.container.dockerContainer;
  if (!containerId) {
    Instance.findById(instance._id, function (err, instance) {
      if (err) { throw err; }
      emitBuildComplete(instance);
    });
    return;
  }
  dockerMock.events.stream.emit('data',
    JSON.stringify({
      status: 'die',
      from: process.env.DOCKER_IMAGE_BUILDER_NAME+':'+process.env.DOCKER_IMAGE_BUILDER_VERSION,
      id: containerId
    }));
}
