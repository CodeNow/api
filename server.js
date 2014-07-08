// FIXME: restore modules
// var configs = require('configs');

// if (configs.nodetime) {
//   var nodetime = require('nodetime');
//   nodetime.profile(configs.nodetime);
// }

// if (configs.newrelic) {
//   require('newrelic');
// }
var api_server = require('index');

var worker = new api_server();
worker.start(function noop () {});
