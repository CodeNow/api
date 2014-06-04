'use strict';
var containerFs = require('models/apis/container-fs');

module.exports = {
  checkParams: function (req, res, next) {
    // translate req to path url
    if (!req.containerFs || !req.containerFs.containerId) {
      return next(new Error('missing container context'));
    }
    next();
  },
  handleList: function (req, res, next) {
    var containerId = req.id;
    var path = req.quary.path;
    var host = req.host;

    containerFs.list(containerId, host, path, function(err, content) {
      if(err) {
        next(err);
      }
      res.send(content);
    });
  },
  handleGet: function (req, res, next) {
    var containerId = req.id;
    var path = req.path;
    var host = req.host;

    containerFs.get(containerId, host, path, function(err, content) {
      if(err) {
        next(err);
      }
      res.send(content);
    });
  },
  handlePatch: function (req, res, next) {
    var containerId = req.id;
    var path = req.path;
    var update = req.update;
    var host = req.host;

    containerFs.patch(containerId, host, path, update, function(err, content) {
      if(err) {
        next(err);
      }
      res.send(content);
    });
  },
  handlePost: function (req, res, next) {
    var containerId = req.id;
    var path = req.path;
    var host = req.host;

    containerFs.post(containerId, host, path, function(err, file) {
      if(err) {
        next(err);
      }
      res.send(201, file);
    });
  },
  handlePut: function (req, res, next) {
    var containerId = req.id;
    var path = req.path;
    var host = req.host;

    containerFs.put(containerId, host, path, function(err, file) {
      if(err) {
        next(err);
      }
      res.send(201, file);
    });
  },
  handleDel: function (req, res, next) {
    var containerId = req.id;
    var path = req.path;
    var host = req.host;

    containerFs.del(containerId, host, path, function(err) {
      if(err) {
        next(err);
      }
      res.send(200);
    });
  }

};