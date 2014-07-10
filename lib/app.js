'use strict';
var express = require('express');
var error = require('error');
var bodyParser = require('body-parser');
var morganFreeman = require('morgan');
var envIs = require('101/env-is');
var passport = require('middlewares/passport');
// var Dogstatsyware = require('dogstatsyware');
var app = module.exports = express();

// CORS
var cors = require('cors');
app.use(cors({
  origin: function (origin, callback) {
    var allow = envIs('development', 'test') ?
      true :
      (origin === 'http://'+process.env.DOMAIN);
    callback(null, allow);
  },
  credentials: true
}));

app.use(require('domains'));
if (envIs('development')) {
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/actions/github', require('./routes/actions/github'));
app.use(require('middlewares/session'));
app.use(passport.initialize({ userProperty: 'sessionUser' }));
app.use(passport.session());
app.use('/auth', require('./routes/auth'));
app.use('/auth', require('./routes/auth/github'));
app.use(require('middlewares/auth').requireAuth);
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
app.use('/instances', require('./routes/instances/containers/files'));
// FIXME: routesore cleanup to former glory
////// app.use('/cleanup', require('./routes/cleanup'));
/* ERRORS */
app.use(error.mongooseErrorCaster);
app.use(error.errorCaster); // must be above nodetime and rollbar!
app.use(error.sendIf400Error);
if (process.env.NODETIME_APP_NAME) {
  app.use(require('nodetime').expressErrorHandler());
}
if (process.env.ROLLBAR || process.env.ROLLBAR_KEY) {
  app.use(require('rollbar').errorHandler());
}
app.use(error.errorHandler);



app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
