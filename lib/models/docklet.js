var util = require('util');
var error = require('error');

var dockletUrl = (process.env.NODE_ENV === 'testing') ?
  'http://localhost:4244' : 'http://docklet.'+configs.domain;

var ApiClient = require('simple-api-client');

module.exports = Docklet;

function Docklet (url) {
  this.url = url || dockletUrl;
  this.request = this.request.defaults({ json:true, pool:false });
}

util.inherits(Docklet, ApiClient);

Docklet.prototype.findDockWithImage = function (image, cb) {
  var body = {
    repo: image.getRepo()
  };
  this.get('/find', { json:body }, function (err, res, body) {
    if (err) {
      cb(err);
    }
    else if (res.statusCode === 500) {
      err = error(500, 'docklet find dock (w/ image) error');
      err.stack = body;
      cb(err);
    }
    else {
      cb(null, body);
    }
  });
};

Docklet.prototype.findDock = function (cb) {
  this.get('/ip', function (err, res, body) {
    if (err) {
      cb(err);
    }
    else if (res.statusCode === 500) {
      err = error(500, 'docklet find dock error');
      err.stack = body;
      cb(err);
    }
    else {
      cb(null, body);
    }
  });
};