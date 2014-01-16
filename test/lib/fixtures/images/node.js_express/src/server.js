var express = require('express');
var http = require('http');
var app = express();
app.get('/', function (req, res) {
  res.json({ message: 'hello world!' });
});
var server = http.createServer(app);
server.listen(9050);