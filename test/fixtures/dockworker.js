var express = require('express');
var app = express();

app.all('*', function (req, res) {
  res.send(404);
  console.log(req.method, req,url);
});

app.listen(3600);