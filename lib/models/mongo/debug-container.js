'use strict';

var DebugContainerSchema = require('models/mongo/schemas/debug-container');
var Docker = require('models/apis/docker');
var async = require('async');
var mongoose = require('mongoose');

var DebugContainer;

DebugContainerSchema.methods.deploy = function (callback) {
  var self = this;
  // use the same docker host, the image should be there
  var host = this.contextVersion.dockerHost;
  var docker = new Docker(host);

  var dockerOpts = {
    Cmd: [ 'sleep', '28800' ],
    Image: this.layerId,
    Labels: {
      type: 'debug-container'
    }
  };

  async.waterfall([
    function create (cb) { docker.createContainer(dockerOpts, cb); },
    function start (container, cb) {
      container.start(function (err) { cb(err, container); });
    },
    function inspect (container, cb) { container.inspect(cb); },
    function saveInfo (info, cb) {
      // set (docker) host in inspect
      info.dockerHost = host;
      // duplicate information for container-fs model
      info.dockerContainer = info.Id;
      DebugContainer.findOneAndUpdate({
        _id: self._id
      }, {
        $set: { inspect: info }
      }, cb);
    }
  ], function (err, doc) {
    callback(err, doc);
  });
};

DebugContainerSchema.methods.destroyContainer = function (callback) {
  var self = this;
  var host = this.contextVersion.dockerHost;
  var docker = new Docker(host);
  var container = this.inspect;

  async.series([
    function stop (cb) { docker.stopContainer(container, cb); },
    function remove (cb) { docker.removeContainer(container, cb); }
  ], function (err) {
    callback(err, self);
  });
};

module.exports = DebugContainer = mongoose.model('DebugContainers', DebugContainerSchema);
