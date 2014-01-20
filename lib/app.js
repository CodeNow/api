var express = require('express');
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
app.use(require('./rest/containers')('/users/:userId/runnables'));
app.use(require('./rest/channels'));
app.use(require('./rest/categories'));
app.use(require('./rest/specifications'));
app.use(require('./rest/implementations'));
app.use(require('./rest/campaigns'));
app.use(app.router);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}
app.get('/cleanup',
  tokens.hasToken,
  users.fetchSelf,
  users.isModerator,
  require('./cleanup'));
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