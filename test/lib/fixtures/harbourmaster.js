var express = require('express');
var configs = require('../../../lib/configs');
var port = configs.harbourmaster.split(':')[2];
var tar = require('tar');
var zlib = require('zlib');
var helpers = require('../helpers');
var app = express();
var redis = require('redis').createClient(configs.redisPort, configs.redisHost);

var images = {};

app.post('/build', function (req, res, next) {
  images[req.query.t] = true;
  var dockerFileFound = false;
  req
    .pipe(zlib.createGunzip())
    .pipe(tar.Parse())
    .on("entry", function (e) {
      if (e.props.path === 'Dockerfile') {
        dockerFileFound = true;
      }
    })
    .on('end', function () {
      if (dockerFileFound) {
        res.send(200, 'Successfully built');
      } else {
        res.send(200, 'I need a dockerfile bro');
      }
    });
});
app.post('/containers', express.json(), function (req, res, next) {
  if (typeof req.body.servicesToken !== 'string' ||
    typeof req.body.webToken !== 'string' ||
    !Array.isArray(req.body.Env) ||
    typeof req.body.Hostname !== 'string') {
    res.send(400);
  } else if (!images[req.body.Image]) {
    console.log(images, req.body.Image);
    res.send(404);
  } else {
    res.send(204);
  }
});
app.post('/containers/cleanup', function (req, res, next) {
  res.send(200);
});
app.del('/containers/:token', function (req, res, next) {
  res.send(204);
});
app.put('/containers/:token/route', function (req, res, next) {
  res.send(200);
});
app.post('/containers/:token/commit', express.json(),
  function (req, res) {
    res.send(204);
    images['registry.runnable.com/runnable/' + req.body._id] = true;
    if (req.body.status === 'Committing new') {
      helpers.request.post('/runnables?from=' +
        req.body._id,
        req.headers['runnable-token'])
        .expect(201)
        .end(finished);
    } else {
      helpers.request.put('/runnables/' +
        req.body.parent +
        '?from=' +
        req.body._id,
        req.headers['runnable-token'])
        .expect(200)
        .end(finished);
    }
    function finished () {
      setTimeout(function () {
        redis.publish('events:' + req.body.servicesToken + ':progress', 'Finished');
      }, 10);
    }
  });
app.all('*', express.logger(), function (req, res, next) {
  res.send(404);
  console.log(req.url, req.method);
});

if (process.env.NODE_ENV !== 'testing-integration') {
  app.listen(port);
}