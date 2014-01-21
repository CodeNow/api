var express = require('express');
var error = require('./error');
var configs = require('./configs');
var tokens = require('./middleware/tokens');
var users = require('./middleware/users');
var app = module.exports = express();
app.use(require('./domains'));
if (configs.logExpress) {
  app.use(express.logger());
}
app.use(express.json());
app.use(express.urlencoded());
app.use('/token', require('./rest/tokens'));
app.use('/users', require('./rest/users'));
app.use(tokens.hasToken);
app.use('/runnables', require('./rest/images'));
app.use('/images', require('./rest/images'));
app.use(require('./rest/containers')('/users/:userId/runnables'));
app.use(require('./rest/containers')('/containers'));
app.use('/channels', require('./rest/channels'));
app.use(require('./rest/categories'));
app.use(require('./rest/specifications'));
app.use(require('./rest/implementations'));
app.use(require('./rest/campaigns'));
app.use('/cleanup', require('./rest/cleanup'));
app.use(app.router);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}

app.get('/cache',
  tokens.hasToken,
  users.fetchSelf,
  users.isModerator,
  require('./models/caching').updateAllCaches);
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});
app.use(function mongooseErrorHandler (err, req, res, next) {
  if (err.name === 'MongoError') {
    if (err.code === 11000) {
      var message = /\$([^_]+)_/.exec(err.err)[1] + ' already exists';
      err = error(409, message);
    }
  }
  next(err);
});