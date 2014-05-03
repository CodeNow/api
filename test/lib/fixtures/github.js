var express = require('express');
var configs = require('../../../lib/configs');
var helpers = require('../helpers');
var app = express();

app.get('/local/nabber/archive/master.tar.gz', function (req, res, next) {
  var fs = require('fs');
  var path = require('path');
  var archive = path.join(__dirname, 'master.tar.gz');
  var stat = fs.statSync(archive);
  var readStream = fs.createReadStream(archive);
  res.writeHead(200, {
    'content-type': 'application/x-gzip',
    'content-length': stat.size
  });
  readStream.pipe(res);
});
app.all('*', express.logger(), function (req, res, next) {
  res.send(404);
  console.log(req.url, req.method);
});

module.exports.started = false;

var port = 3033;

module.exports.start = function (cb) {
  var self = this;
  this.server = app.listen(port, function (err) {
    if (err) { throw err; }
    self.started = true;
    cb(err);
  });
  return this;
};
module.exports.stop = function (cb) {
  var self = this;
  this.server.close(function (err) {
    self.started = false;
    cb(err);
  });
  return this;
};

module.exports.url = 'http://localhost:'+port+'/local/nabber';