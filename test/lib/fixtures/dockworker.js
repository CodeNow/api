var express = require('express');
var app = express();
var port = 3600;

app.post('/api/files/readall', function (req, res) {
  res.json(201, []);
});

app.all('*', express.logger(), function (req, res) {
  res.send(404);
});

module.exports = {
  app: app,
  start: function (callback) {
    // hack block mocks on testing int for now
    if (process.env.NODE_ENV === 'testing-integration') return callback();
    app.listen(port, callback);
  },
  stop: function (callback) {
    // hack block mocks on testing int for now
    if (process.env.NODE_ENV === 'testing-integration') return callback();
    app.close(callback);
  }
};