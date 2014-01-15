var express = require('express');
var configs = require('./configs');
var app = module.exports = express();
app.use(require('./domains'));
if (configs.logExpress) {
  app.use(express.logger());
}
app.use(express.json());
app.use(express.urlencoded());
app.use(require('./rest/users'));
app.use(require('./rest/impexp'));
app.use(require('./rest/runnables'));
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
app.get('/cleanup', require('./cleanup'));
app.get('/cache', require('./models/caching').updateAllCaches);
app.get('/', function (req, res) {
  res.json({ message: 'runnable api' });
});
app.all('*', function (req, res) {
  res.json(404, { message: 'resource not found' });
});