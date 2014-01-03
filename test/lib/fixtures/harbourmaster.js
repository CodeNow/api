var express = require('express');
var configs = require('../../../lib/configs');
var port = configs.harbourmaster.split(':')[2]
var app = express();

app.use(express.bodyParser());
app.use(express.logger())
app.use(app.router);
app.post('/build', function (req, res, next) {
  // req.query.t
  res.send(200, 'Successfully built');
});
app.post('/containers', function (req, res, next) {
  // body contains:
  // servicesToken: servicesToken
  // webToken: 'web-' + uuid.v4()
  // Env: [
  //   "RUNNABLE_USER_DIR=#{image.file_root}"
  //   "RUNNABLE_SERVICE_CMDS=#{image.service_cmds}"
  //   "RUNNABLE_START_CMD=#{image.start_cmd}"
  //   "RUNNABLE_BUILD_CMD=#{image.build_cmd}"
  //   "APACHE_RUN_USER=www-data"
  //   "APACHE_RUN_GROUP=www-data"
  //   "APACHE_LOG_DIR=/var/log/apache2"
  // ]
  // Hostname: image._id.toString()
  // Image: imageTag
  // PortSpecs: [ image.port.toString() ]
  // Cmd: [ image.cmd ]
  res.send(201);
});
app.post('/containers/:token', function (req, res, next) {
  res.send(204);
});
app.all('*', function (req, res, next) {
  res.send(404);
});


module.exports = {
  app: app,
  start: function (callback) {
    // hack block mocks on testing int for now
    if (process.env.NODE_ENV === 'testing-integration') return callback();
    console.log('harbourmasterport', port)
    app.listen(port, callback);
  },
  stop: function (callback) {
    // hack block mocks on testing int for now
    if (process.env.NODE_ENV === 'testing-integration') return callback();
    app.close(callback);
  }
};