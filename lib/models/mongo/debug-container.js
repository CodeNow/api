'use strict';

var DebugContainerSchema = require('models/mongo/schemas/debug-container');
var Docker = require('models/apis/docker');
var async = require('async');
var mongoose = require('mongoose');

DebugContainerSchema.methods.deploy = function (callback) {
  var self = this;
  // use the same docker host, the image should be there
  var host = this.contextVersion.dockerHost;
  var docker = new Docker(host);

  var dockerOpts = {
    Cmd: [ 'sleep', '28800' ],
    Image: this.layerId
  };

  async.series([
    function create (cb) { docker.createContainer(dockerOpts, cb); },
    function inspect (info, cb) { docker.inspectContainer(info.Id, cb); },
    function saveInfo (info, cb) {
      self.inspect = info;
      self.save(cb);
    }
  ], function (err) {
    callback(err, self);
  });
};

var DebugContainer = mongoose.model('DebugContainers', DebugContainerSchema);
module.exports = DebugContainer;
