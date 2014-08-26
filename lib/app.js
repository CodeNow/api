'use strict';
var express = require('express');
var error = require('error');
var bodyParser = require('body-parser');
var morganFreeman = require('morgan');
var envIs = require('101/env-is');
var passport = require('middlewares/passport');
var compression = require('compression');
var pkg = require('../package.json');
// var Dogstatsyware = require('dogstatsyware');
var app = module.exports = express();

app.use('/github', require('./routes/github'));

app.use(require('middlewares/cors'));
app.use(require('domains'));
if (envIs('development')) {
  app.use(morganFreeman());
  app.use(function (req, res, next) {
    console.log(req.method, '-', req.url);
    next();
  });
}
// FIXME: re-instate datadog
// app.use(Dogstatsyware({
//   service: 'api-server'
// }));
app.use(require('middlewares/no-cache'));
app.use(compression());
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
app.use('/projects', require('./routes/projects/views'));
app.use('/projects', require('./routes/projects/environments'));
app.use('/projects', require('./routes/projects/environments/builds'));
app.use('/projects', require('./routes/projects'));
app.use('/contexts', require('./routes/contexts'));
app.use('/contexts', require('./routes/contexts/versions'));
app.use('/contexts', require('./routes/contexts/versions/files'));
app.use('/contexts', require('./routes/contexts/versions/app-code-versions'));
app.use('/instances', require('./routes/instances'));
app.use('/instances', require('./routes/instances/containers/files'));
/* ERRORS */
app.use(error.mongooseErrorCaster);
app.use(error.errorCaster);
app.use(error.sendIf400Error);
app.use(error.errorHandler);

app.get('/', function (req, res) {
  res.json({ 
    message: 'runnable api',
    version: pkg.version,
    data: process.env.VERSION_DATA
  });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
