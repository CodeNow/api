var express = require('express');
var configs = require('./configs');
var auth = require('./middleware/auth');
var app = module.exports = express();
app.use(require('./domains'));
if (configs.logExpress) {
  app.use(express.logger());
}
app.use(express.json());
app.use(express.urlencoded());
app.use('/token', require('./rest/tokens'));
app.use('/users', require('./rest/users'));
app.use(auth.hasToken, require('./rest/impexp'));
app.use(auth.hasToken, require('./rest/runnables'));
app.use(auth.hasToken, require('./rest/channels'));
app.use(auth.hasToken, require('./rest/categories'));
app.use(auth.hasToken, require('./rest/specifications'));
app.use(auth.hasToken, require('./rest/implementations'));
app.use(auth.hasToken, require('./rest/campaigns'));
app.use(app.router);
if (configs.nodetime) {
  app.use(require('nodetime').expressErrorHandler());
}
if (configs.rollbar) {
  app.use(require('rollbar').errorHandler());
}
app.get('/cleanup', require('./cleanup'));
app.get('/cache', require('./models/caching').updateAllCaches);
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});