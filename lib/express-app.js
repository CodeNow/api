/**
 * @module lib/express-app
 */
'use strict';

var bodyParser = require('body-parser');
var compression = require('compression');
var envIs = require('101/env-is');
var express = require('express');
var morganFreeman = require('morgan');

var Timer = require('models/apis/timers');
var dogstatsd = require('models/datadog');
var error = require('error');
var passport = require('middlewares/passport');
var pkg = require('../package.json');

var app = module.exports = express();

if (envIs('production')) {
  app.use(require('connect-datadog')({
    'dogstatsd': dogstatsd,
    'response_code': true,
    'method': true,
    'tags': [ 'name:api', 'logType:express', 'env:' + process.env.NODE_ENV ]
  }));
}
if (!envIs('test')) {
  app.use(morganFreeman('short'));
}
app.use(require('routes/github'));
app.use(require('routes/instances/dependencies/health'));
app.use(require('middlewares/cors'));
app.use(require('middlewares/domains'));
if (envIs('test')) { // routes for testing only
  app.use(require('routes/test/errors'));
}
app.use(require('middlewares/no-cache'));
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(function (req, res, next) {
  req.bodyParserTimer = new Timer();
  req.bodyParserTimer.startTimer('json_body_parser', next);
});
app.use(bodyParser.json({ limit: process.env.BODY_PARSER_SIZE_LIMIT }));
app.use(function (req, res, next) {
  var payloadSize = req.headers['content-length'];
  req.bodyParserTimer.stopTimer('json_body_parser', ['payloadSize:' + payloadSize], next);
});
app.use(require('routes/actions/github'));
app.use(require('middlewares/session'));
app.use(passport.initialize({ userProperty: 'sessionUser' }));
app.use(passport.session());
// attach session properties to domain
app.use(require('middlewares/domains').updateDomain);
app.use(require('routes/auth'));
app.use(require('routes/auth/github'));
app.use(require('routes/actions/redirect'));
app.use(require('middlewares/auth').requireAuth);
app.use(require('routes/actions/analyze/index'));
app.use(require('routes/actions/moderate'));
app.use(require('routes/auth/whitelist'));
// only for beta
// NOTE: this is temporary code until shiva matures
// we enable this in `test` too just for testing
if (envIs('production-beta') && envIs('test')) {
  app.use(require('routes/actions/internal/deprovision-clusters'));
}
app.use(require('routes/builds'));
app.use(require('routes/contexts'));
app.use(require('routes/contexts/versions'));
app.use(require('routes/contexts/versions/app-code-versions'));
app.use(require('routes/contexts/versions/files'));
app.use(require('routes/debug-containers'));
app.use(require('routes/debug-containers/files'));
app.use(require('routes/instances'));
app.use(require('routes/instances/containers'));
app.use(require('routes/instances/containers/files'));
app.use(require('routes/instances/dependencies'));
app.use(require('routes/instances/master-pod'));
app.use(require('routes/settings'));
app.use(require('routes/templates'));
app.use(require('routes/users'));
app.use(require('routes/users/routes'));
app.use(require('routes/health'));
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
