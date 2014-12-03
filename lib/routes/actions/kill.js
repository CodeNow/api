'use strict';

/**
 * Kill the server
 * @module rest/actions/kill
 * stop listening for event
 * stop listening for http calls
 * wait for all sockets to die
 * process.kill(0) after all sockets are gone
 * process.kill(1) if process not killed before process.env.KILL_TIMEOUT
 * KILL_TIMEOUT == 30 min
 */
var express = require('express');
var app = module.exports = express();
var keypather = require('keypather')();
var Boom = require('dat-middleware').Boom;
var debug = require('debug')('actions:kill');
var mw = require('dat-middleware');

app.post('/actions/kill/', function (req, res) {
  res.status(204).end();
  console.log('aaa', apiServer.server._connections);
  setTimeout(function () {
    if (apiServer.server._connections > 0) {
      debug('exit. 0 connections were alive');
      process.kill(0);
    } else {
      debug('exit. few connections were still alive');
      process.kill(1);
    }
  }, process.env.KILL_TIMEOUT);
  apiServer.stop(function () {
    debug('stop accepting new connections');
  });

});
