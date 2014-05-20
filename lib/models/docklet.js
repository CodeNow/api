'use strict';

var debug = require('debug')('docklet:model');
var util = require('util');
var error = require('error');
var configs = require('configs');

var dockletUrl = (process.env.NODE_ENV === 'testing' || process.env.NODE_ENV === 'test') ?
  'http://localhost:4244' : 'http://docklet.'+configs.domain;

var ApiClient = require('simple-api-client');

module.exports = Docklet;

function Docklet (url, port) {
  if (port) {
    url = url + ':' + port;
  }
  this.url = url || dockletUrl;
  if (!~this.url.indexOf('http')) {
    this.url = 'http://'+this.url;
  }
  this.request = this.request.defaults({ json:true, pool:false });
}

util.inherits(Docklet, ApiClient);

Docklet.prototype.findDockWithImage = function (image, servicesToken, cb) {
  var body = {
    repo: image.getRepo(),
    servicesToken: servicesToken
  };
  this.post('/find', { json:body }, function (err, res, body) {
    if (err) {
      cb(err);
    }
    else if (res.statusCode !== 200) {
      err = error(502, 'docklet find dock (w/ image) error');
      err.stack = body;
      cb(err);
    }
    else {
      cb(null, body);
    }
  });
};

Docklet.prototype.findDock = function (cb) {
  debug('finding dock');
  this.get('/ip', function (err, res, body) {
    if (err) {
      cb(err);
    }
    else if (res.statusCode !== 200) {
      err = error(502, 'docklet find dock error');
      err.stack = body;
      cb(err);
    }
    else {
      debug('done finding dock');
      cb(null, body);
    }
  });
};

Docklet.prototype.addImageRepoById = function (repoId, cb) {
  var json = {
    repo: configs.dockerRegistry+'/runnable/'+repoId
  };
  this.put('/imageCache', { json: json }, function (err, res, body) {
    if (err) {
      cb(err);
    }
    else if (res.statusCode !== 201) {
      err = error(502, 'error adding image to cache');
      err.stack = body;
      cb(err);
    }
    else {
      cb(null, body);
    }
  });
};
