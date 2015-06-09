/**
 * Creates instance of http server, starts/stops
 * listening to requests
 * @module lib/server
 */
'use strict';

var createCounter = require('callback-count');
var debug = require('debug')('runnable-api:server');
var fs = require('fs');
var http = require('http');
var https = require('https');

var SocketServer = require('socket/socket-server.js');
var RabbitMQ = require('models/rabbitmq');

module.exports = Server;

if (process.env.NEWRELIC_NAME && process.env.NEWRELIC_KEY) {
  require('newrelic');
}

/**
 * Creates instance of Express and an HTTP server
 * @class
 * @return this
 */
function Server () {
  debug('new Server()');
  require('http').globalAgent.maxSockets = 1000;
  require('https').globalAgent.maxSockets = 1000;
  this.app = require('./express-app');
  this.express = http.createServer(this.app);
  this.socketServer = new SocketServer(this.express);
  // already connected instance
  this.rabbitMQ = new RabbitMQ();
  return this;
}

/**
 * HTTP server begin listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.start = function (cb) {
  debug('start', process.env.PORT);
  var self = this;
  var counter = createCounter(cb);
  var options = {
    ca: fs.readFileSync('lib/certs/server.csr'),
    cert: fs.readFileSync('lib/certs/server.crt'),
    key: fs.readFileSync('lib/certs/server.key')
  };
  counter.inc();
  this.express.listen(process.env.PORT, function (err) {
    if (err) { return counter.next(err); }
    self.rabbitMQ.connect(); // sets this.rabbitMq.hermesClient
    self.rabbitMQ.loadWorkers(); // does not need to wait for rabbitMq.connect cb
    counter.next();
  });
  if (process.env.HTTPS) {
    https.createServer(options, this.app).listen(process.env.HTTPS_PORT || 443, counter.inc().next);
  }
  return this;
};

/**
 * Cease listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.stop = function (cb) {
  debug('stop');
  this.rabbitMQ.unloadWorkers();
  this.express.close(cb);
  return this;
};
