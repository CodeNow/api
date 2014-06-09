'use strict';

var express = require('express');
var error = require('error');
var configs = require('configs');
var tokens = require('middlewares/tokens');
var utils = require('middlewares/utils');
var bodyParser = require('body-parser');
var morganFreeman = require('morgan');
var error = require('error');
// var Dogstatsyware = require('dogstatsyware');
var app = module.exports = express();

// CORS
var cors = require('cors');
var whitelistOrigins = [
  'http://runnable.com',
  'http://localhost'
];
app.use(cors({
  origin: function (origin, callback) {
    var originIsWhitelisted = whitelistOrigins.indexOf(origin) !== -1;
    callback(null, originIsWhitelisted);
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
app.use('/token', require('./routes/tokens'));
app.use('/users', require('./routes/users'));
app.use(tokens.hasToken);
app.use('/projects', require('./routes/projects/views'));
app.use('/projects', require('./routes/projects/environments'));
app.use('/projects', require('./routes/projects'));
app.use('/contexts', require('./routes/contexts'));
app.use('/versions', require('./routes/versions'));
app.use('/versions', require('./routes/versions/files'));
/////// app.use('/containers', require('./routes/containers'));
app.use('/instances', require('./routes/instances'));
app.use('/instances', require('./routes/containers/containerFiles'));
// FIXME: replace with projects
// app.use('/feeds/images', require('./routes/feeds/images'));
// FIXME: refactor if still needed
// app.use(require('./routes/containers')('/users/:userId/runnables'));
// FIXME: rename channels to tags
// app.use('/channels', require('./routes/channels'));
// FIXME: delete categories (merge with channels/tags)
// app.use(require('./routes/categories'));
// FIXME: delete campaigns
// app.use(require('./routes/campaigns'));
// FIXME: routesore cleanup to former glory
////// app.use('/cleanup', require('./routes/cleanup'));
// FIXME: routesore emails route
// app.use(require('./routes/emails'));
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
app.use(errorCaster); // must be above nodetime and rollbar!
app.use(mongooseErrorCaster);
app.use(sendIf400Error);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}
app.use(error.errorHandler);


function sendIf400Error (err, req, res, next) {
  // only 401s and 404s for now bc they are spammy
  // continue to track 404s on container pages for analytics purposes
  if (err.isBoom && err.output.statusCode === 401) {
    res.json(err.code, {
      message: err.msg,
      stack: configs.throwErrors ?
        err.stack : undefined
    });
  }
  else {
    next(err);
  }
}

function mongooseErrorCaster (err, req, res, next) {
  if (err.name === 'MongoError') {
    if (err.code === 11000) {
      var resourceAliases = {
        image: 'runnable',
        container: 'draft',
        me: 'user'
      };
      var fieldAliases = {
        aliases: 'name',
        lower: 'username'
      };
      var match = /([^.]+).\$([^_]+)_/.exec(err.err);
      var resource = utils.singularize(match[1]);
      resource = resourceAliases[resource] || resource;
      var field = fieldAliases[match[2]] || match[2];
      var message = resource + ' with ' + field + ' already exists';
      err = error(409, message, { err: err });
    }
  }
  next(err);
}

function errorCaster (err, req, res, next) {
  if (err instanceof Error) {
    next(err);
  }
  else {
    try {
      err = new Error(JSON.stringify(err));
    }
    catch (stringifyErr) {
      err = new Error(err+'');
    }
    next(err);
  }
}
