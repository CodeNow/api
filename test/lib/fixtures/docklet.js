var express = require('express');
var app = express();

app.post('/flatten', function (req, res, next) {
  res.send(201);
});

app.post('/find', function (req, res, next) {
  res.json('localhost');
});

app.put('/imageCache', function (req, res, next) {
  res.json(201, res.body);
});

app.get('/ip', function (req, res, next) {
  res.json('localhost');
});

app.all('*', express.logger(), function (req, res, next) {
  res.send(404);
  console.log(req.url, req.method);
});

module.exports.started = false;
module.exports.start = function (cb) {
  var self = this;
  this.server = app.listen(4244, function (err) {
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