'use strict';
var express = require('express');
var error = require('error');
var bodyParser = require('body-parser');
var morganFreeman = require('morgan');
var envIs = require('101/env-is');
var passport = require('middlewares/passport');
var compression = require('compression');
var pkg = require('../package.json');
var dogstatsd = require('models/datadog');
var app = module.exports = express();

if (envIs('production')) {
  app.use(require('connect-datadog')({
    'dogstatsd': dogstatsd,
    'response_code':true,
    'method':true,
    'tags': ['name:api', 'logType:express', 'env:'+process.env.NODE_ENV]
  }));

  app.use(dogstatsd.captureSocketCount);
}

if (envIs('development', 'local', 'stage')) {
  app.use(morganFreeman('short'));
}

app.use(require('./routes/github'));

app.use(require('middlewares/cors'));
app.use(require('middlewares/domains'));
if (envIs('test')) { // routes for testing only
  app.use(require('./routes/test/errors'));
}
app.use(require('middlewares/no-cache'));
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(require('./routes/actions/github'));
app.use(require('middlewares/session'));
app.use(passport.initialize({ userProperty: 'sessionUser' }));
app.use(passport.session());
app.use(require('./routes/auth'));
app.use(require('./routes/auth/github'));
app.use(require('middlewares/auth').requireAuth);
app.use(require('./routes/users'));
app.use(require('./routes/builds'));
app.use(require('./routes/contexts'));
app.use(require('./routes/contexts/versions'));
app.use(require('./routes/contexts/versions/files'));
app.use(require('./routes/contexts/versions/app-code-versions'));
app.use(require('./routes/instances'));
app.use(require('./routes/instances/containers'));
app.use(require('./routes/instances/containers/files'));
app.use(require('./routes/settings'));
/* ERRORS */
app.use(error.mongooseErrorCaster);
app.use(error.errorCaster);
app.use(error.sendIf400Error);
app.use(error.errorHandler);

app.get('/', function (req, res) {
  res.json({
    message: 'runnable api',
    version: pkg.version,
    branch: process.env._VERSION_GIT_BRANCH,
    codeVersion: process.env._VERSION_GIT_COMMIT
  });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
