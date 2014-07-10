// FIXME: restore modules
// var loadenv = require('loadenv');
// loadenv();


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
