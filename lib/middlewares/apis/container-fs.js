'use strict';
var containerFs = require('models/apis/container-fs');
var pathModule = require('path');
var url = require('url');

module.exports = {
  checkParams: function (req, res, next) {
    // needs containerId and host
    if (!req.containerFs || !req.containerFs.containerId || !req.containerFs.host) {
      console.log("TODO: check for and validate params");
      // return next(new Error('missing container context'));
      req.param.container = {};
      req.param.container.id = "1";
      req.param.container.host = "localhost";
      req.param.path = decodeURI(url.parse(req.url).pathname);
      req.param.path = req.param.path.substring(req.param.path.indexOf('files')+5);
      if (req.body.path && req.body.name) {
        req.param.path = pathModule.join(req.body.path, req.body.name);
      } else if (req.query.path) {
        req.param.path = req.query.path;
      }
      req.param.content = req.body.content || '';
      req.param.isDir = req.body.isDir;

    }
    next();
  },
  handleList: function (req, res, next) {
    var container = req.param.container;
    var path = pathModule.join(req.param.path);

    containerFs.list(container, path, function(err, content) {
      if(err) {
        return next(err);
      }
      res.send(content);
    });
  },
  handleGet: function (req, res, next) {
    var container = req.param.container;
    var path = req.param.path;

    containerFs.get(container, path, function(err, content) {
      if(err) {
        return next(err);
      }
      res.send(content);
    });
  },
  handlePatch: function (req, res, next) {
    var container = req.param.container;
    var path = req.param.path;
    var isDir = req.param.isDir;
    var content = req.param.content;
    var newObject = {};

    if (content) {
      newObject.content = content;
    }
    containerFs.patch(container, path, newObject, function(err, content) {
      if(err) {
        return next(err);
      }
      res.send(200, {
        content: content,
        path: pathModule.dirname(path),
        name: pathModule.basename(path),
        isDir: isDir
      });
    });
  },
  handlePost: function (req, res, next) {
    var container = req.param.container;
    var path = req.param.path;

    containerFs.post(container, path, req.body, function(err, file) {
      if(err) {
        return next(err);
      }
      res.send(201, file);
    });
  },
  handlePut: function (req, res, next) {
    var container = req.param.container;
    var path = req.param.path;

    containerFs.put(container, path, function(err, file) {
      if(err) {
        return next(err);
      }
      res.send(201, file);
    });
  },
  handleDel: function (req, res, next) {
    var container = req.param.container;
    var path = req.param.path;

    containerFs.del(container, path, function(err) {
      if(err) {
        return next(err);
      }
      res.send(200);
    });
  }

};