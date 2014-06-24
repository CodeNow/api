'use strict';

var express = require('express');
var error = require('error');
var configs = require('configs');
var utils = require('middlewares/utils');
var bodyParser = require('body-parser');
var morganFreeman = require('morgan');
var envIs = require('101/env-is');
var error = require('error');
var passport = require('middlewares/passport');
// var Dogstatsyware = require('dogstatsyware');
var app = module.exports = express();

// CORS
var cors = require('cors');
app.use(cors({
  origin: function (origin, callback) {
    var allow = envIs('development', 'test') ?
      true :
      (origin === 'http://'+configs.domain);
    callback(null, allow);
  }
}));

app.use(require('domains'));
if (configs.logExpress) {
  app.use(morganFreeman());
  app.use(function (req, res, next) {
    console.log(req.method, req.url);
    next();
  });
}
// FIXME: re-instate datadog
// app.use(Dogstatsyware({
//   service: 'api-server'
// }));
app.use(bodyParser());
app.use(require('middlewares/session'));
app.use(passport.initialize());
app.use(passport.session());
app.use('/auth', require('./routes/auth/github'));
app.use('/users', require('./routes/users'));
app.use('/groups', require('./routes/groups'));
app.use('/projects', require('./routes/projects/views'));
app.use('/projects', require('./routes/projects/environments'));
app.use('/projects', require('./routes/projects/environments/builds'));
app.use('/projects', require('./routes/projects'));
app.use('/contexts', require('./routes/contexts'));
app.use('/contexts', require('./routes/contexts/versions'));
app.use('/contexts', require('./routes/contexts/versions/files'));
/////// app.use('/containers', require('./routes/containers'));
app.use('/instances', require('./routes/instances'));
app.use('/instances', require('./routes/containers/files'));
// FIXME: routesore cleanup to former glory
////// app.use('/cleanup', require('./routes/cleanup'));
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
app.use(error.errorHandler);