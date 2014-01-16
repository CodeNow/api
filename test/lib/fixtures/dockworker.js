var express = require('express');
var app = express();
var port = 3600;

app.post('/api/files/readall', function (req, res) {
  res.json(201, []);
});

app.post('/api/buildCmd', function (req, res) {
  res.send(200);
});

app.post('/api/cmd', function (req, res) {
  res.send(200);
});

app.post('/api/envs', function (req, res) {
  res.send(200);
});

app.all('*', express.logger(), function (req, res) {
  res.send(404);
});

if (process.env.NODE_ENV !== 'testing-integration') {
  app.listen(port);
}