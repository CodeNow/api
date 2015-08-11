/**
 * Creates instance of http server, starts/stops
 * listening to requests
 * @module lib/server
 */
'use strict';

var async = require('async');
var createCounter = require('callback-count');
var fs = require('fs');
var http = require('http');
var https = require('https');

var SocketServer = require('socket/socket-server.js');
var rabbitMQ = require('models/rabbitmq');
var logger = require('middlewares/logger')(__filename);

var log = logger.log;

module.exports = Server;

/**
 * Creates instance of Express and an HTTP server
 * @class
 * @return this
 */
function Server () {
  log.trace({}, 'server');
  require('http').globalAgent.maxSockets = 1000;
  require('https').globalAgent.maxSockets = 1000;
  this.app = require('./express-app');
  this.express = http.createServer(this.app);
  this.socketServer = new SocketServer(this.express);
  // already connected instance
  this.rabbitMQ = rabbitMQ;
  return this;
}

/**
 * HTTP server begin listening for incoming HTTP requests
 * @param {Function} cb
 */
Server.prototype.start = function (cb) {
  log.trace({}, 'start');
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
    self.rabbitMQ.connect(function (err) {
      if (err) { return counter.next(err); }
      if (process.env.IS_QUEUE_WORKER) {
        self.rabbitMQ.loadWorkers();
      }
      counter.next();
    }); // sets this.rabbitMq.hermesClient
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
  log.trace({}, 'stop');

  var seriesTasks = [
    this.rabbitMQ.close.bind(this.rabbitMQ),
    this.express.close.bind(this.express)
  ];
  if (process.env.IS_QUEUE_WORKER) {
    seriesTasks.unshift(this.rabbitMQ.unloadWorkers.bind(this.rabbitMQ));
  }
  async.series(seriesTasks, function (err) {
    cb(err);
  });
  return this;
};
