'use strict';
var containerFs = require('models/apis/container-fs');
var pathModule = require('path');
var url = require('url');
var last = require('101/last');
var Busboy = require('busboy');
var createCount = require('callback-count');

module.exports = {
  /*jshint maxcomplexity:10*/
  parseParams: function(req, res, next) {
    var container = req.container;

    req.params.container = {};
    req.params.container.id = container.dockerContainer;
    req.params.container.host = container.dockerHost;
    req.params.path = decodeURI(url.parse(req.url).pathname);
    req.params.path = req.params.path.substring(req.params.path.indexOf('files') + 5);
    next();
  },
  parseBody: function(req, res, next) {
    if (req.body.path) {
      handleBodyPath(req);
    } else if (req.body.name) {
      handleBodyName(req);
    } else if (req.query.path) {
      req.params.path = req.query.path;
    }
    req.params.content = req.body.body || '';
    req.params.isDir = req.body.isDir;
    if (req.params.path.length > 1) {
      if (req.body.isDir && last(req.params.path) !== '/') {
        req.params.path = pathModule.join(req.params.path, '/');
      } else if (!req.body.isDir && last(req.params.path) === '/') {
        req.params.path = req.params.path.slice(0, -1);
      }
    }
    next();
    function handleBodyPath(req) {
      var name = req.body.name;
      if (/^patch$/i.test(req.method)) {
        name = name || pathModule.basename(req.params.path);
        // if this is a patch req.body.path and name are for a newPath
        req.params.newPath = pathModule.join(req.body.path, name);
      } else {
        req.params.path = pathModule.join(req.body.path, name);
      }
    }
    function handleBodyName(req) {
      var path = req.params.path;
      // I have to do this to remove the slash that the UI may add to the call
      if (last(path) === '/') {
        path = path.slice(0, -1);
      }
      var oldPath = pathModule.dirname(path);
      req.params.newPath = pathModule.join(oldPath, req.body.name);
    }
  },
  handleList: function(req, res, next) {
    var container = req.params.container;
    var path = pathModule.join(req.params.path);
    containerFs.list(container, path, function(err, content) {
      if (err) {
        return next(err);
      }
      res.send(content);
    });
  },
  handleStream: function(req, res, next) {
    var container = req.params.container;
    var busboy = new Busboy({
      headers: req.headers
    });
    var out = [];
    var count = createCount(function() {
      res.json(201, out);
    });
    // initial increment for finished callback. this ensure all files are done parsing before
    // done is called. Can happen when postStream finishes and the next file part has not come
    count.inc();
    busboy.on('file', handleFile);
    busboy.on('finish', count.next);
    req.pipe(busboy);

    function handleFile(fieldname, file, filename) {
      count.inc();
      containerFs.postStream(container, '/' + filename, file, function(err, body) {
        if (err) {
          return next(err);
        }
        out.push(body);
        count.next();
      });
    }
  },
  handleGet: function(req, res, next) {
    var container = req.params.container;
    var path = req.params.path;
    containerFs.get(container, path, function(err, content) {
      if (err) {
        return next(err);
      }
      res.send({
        path: pathModule.dirname(path),
        name: pathModule.basename(path),
        isDir: path.substr(-1) === '/',
        body: content
      });
    });
  },
  handlePatch: function(req, res, next) {
    var container = req.params.container;
    var path = req.params.path;
    var newPath = req.params.newPath;
    var content = req.params.content;
    var newObject = {};

    if (content) {
      newObject.content = content;
    }
    if (newPath) {
      newObject.newPath = newPath;
    }
    containerFs.patch(container, path, newObject, function(err, updatedObject) {
      if (err) {
        return next(err);
      }
      updatedObject.body = newObject.content;
      res.status(200).send(updatedObject);
    });
  },
  handlePost: function(req, res, next) {
    var container = req.params.container;
    var path = req.params.path;
    containerFs.post(container, path, req.body, function(err, file) {
      if (err) {
        return next(err);
      }
      file.body = req.body.content;
      res.send(201, file);
    });
  },
  handleDel: function(req, res, next) {
    var container = req.params.container;
    var path = req.params.path;
    containerFs.del(container, path, function(err) {
      if (err) {
        return next(err);
      }
      res.send(204);
    });
  }
};
