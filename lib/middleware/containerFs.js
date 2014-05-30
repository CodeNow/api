'use strict';
var containerFs = require('models/containerFs');

module.exports = {
  checkParams: function (req, res, next) {
    // translate req to path url
    if (!req.containerFs || !req.containerFs.containerId) {
      return next(new Error('missing container context'));
    }
    next();
  },
  handleGet: function (req, res, next) {
    containerFs.get(req.body.request, function(err, content) {
      if(err) {
        next(err);
      }
      res.send(content);
    });
  },
  handlePost: function (req, res, next) {
    containerFs.post(req.body.request, function(err, file) {
      if(err) {
        next(err);
      }
      res.send(201, file);
    });
  },
  handlePut: function (req, res, next) {
    containerFs.put(req.body.request, function(err, file) {
      if(err) {
        next(err);
      }
      res.send(201, file);
    });
  },
  handleDel: function (req, res, next) {
    containerFs.del(req.body.request, function(err) {
      if(err) {
        next(err);
      }
      res.send(200);
    });
  }

};