'use strict';
var containerFs = require('models/apis/container-fs');
var pathModule = require('path');
var url = require('url');

module.exports = {
  checkParams: function (req, res, next) {
    var container = req.instance.findContainerById(req.params.containerId);

    req.params.container = {};
    req.params.container.id = container.dockerContainer;
    req.params.container.host = container.dockerHost;
    req.params.path = decodeURI(url.parse(req.url).pathname);
    req.params.path = req.params.path.substring(req.params.path.indexOf('files')+5);
    if (req.body.path && req.body.name) {
      req.params.path = pathModule.join(req.body.path, req.body.name);
    } else if (req.query.path) {
      req.params.path = req.query.path;
    }
    req.params.content = req.body.content || '';
    req.params.isDir = req.body.isDir;

    next();
  },
  handleList: function (req, res, next) {
    var container = req.params.container;
    var path = pathModule.join(req.params.path);

    containerFs.list(container, path, function(err, content) {
      if(err) {
        return next(err);
      }
      res.send(content);
    });
  },
  handleGet: function (req, res, next) {
    var container = req.params.container;
    var path = req.params.path;

    containerFs.get(container, path, function(err, content) {
      if(err) {
        return next(err);
      }
      res.send({
        path: pathModule.dirname(path),
        name: pathModule.basename(path),
        isDir: path.substr(-1) === '/',
        content: content
      });
    });
  },
  handlePatch: function (req, res, next) {
    var container = req.params.container;
    var path = req.params.path;
    var content = req.params.content;
    var newObject = {};

    if (content) {
      newObject.content = content;
    }
    containerFs.patch(container, path, newObject, function(err, updatedObject) {
      if(err) {
        return next(err);
      }
      updatedObject.content = newObject.content;
      res.send(200, updatedObject);
    });
  },
  handlePost: function (req, res, next) {
    var container = req.params.container;
    var path = req.params.path;

    containerFs.post(container, path, req.body, function(err, file) {
      if(err) {
        return next(err);
      }
      file.content = req.body.content;
      res.send(201, file);
    });
  },
  handlePut: function (req, res, next) {
    var container = req.params.container;
    var path = req.params.path;

    containerFs.put(container, path, function(err, file) {
      if(err) {
        return next(err);
      }
      file.content = req.body;
      res.send(201, file);
    });
  },
  handleDel: function (req, res, next) {
    var container = req.params.container;
    var path = req.params.path;

    containerFs.del(container, path, function(err) {
      if(err) {
        return next(err);
      }
      res.send(200);
    });
  }

};