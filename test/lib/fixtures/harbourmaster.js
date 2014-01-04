var express = require('express');
var configs = require('../../../lib/configs');
var port = configs.harbourmaster.split(':')[2]
var app = express();

app.post('/build', function (req, res, next) {
  res.send(200, 'Successfully built');
});
app.post('/containers', function (req, res, next) {
  res.send(204);
});
app.post('/containers/:token', function (req, res, next) {
  res.send(204);
});
app.del('/containers/:token', function (req, res, next) {
  res.send(204);
})
app.all('*', express.logger(), function (req, res, next) {
  res.send(404);
});

if (process.env.NODE_ENV !== 'testing-integration') {
  app.listen(port);
}