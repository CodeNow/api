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

var debug = require('debug')('actions:kill');

// TODO we need to check that request is internal. SHould we add basic auth?
// we need to cover this request with tests
app.post('/actions/kill/',
  function (req, res) {
    res.status(204).end();
    setTimeout(function () {
      if (global.apiServer.server._connections > 0) {
        debug('exit. 0 connections were alive');
        process.kill(0);
      } else {
        debug('exit. few connections were still alive');
        process.kill(1);
      }
    }, process.env.KILL_TIMEOUT);
   global.apiServer.stop(function () {
      debug('stop accepting new connections');
    });
 });