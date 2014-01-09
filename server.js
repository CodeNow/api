var configs = require('./lib/configs');

if (configs.nodetime && cluster.isWorker) {
  var nodetime = require('nodetime');
  nodetime.profile(configs.nodetime);
}

var debug = require('debug')('master');

var api_server = require('./lib');
var os = require('os');

var worker = new api_server(configs, null);
worker.start(function () { });