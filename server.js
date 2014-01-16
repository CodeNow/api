var configs = require('./lib/configs');

if (configs.nodetime) {
  var nodetime = require('nodetime');
  nodetime.profile(configs.nodetime);
}

var api_server = require('./lib');

var worker = new api_server();
worker.start(function noop () {});