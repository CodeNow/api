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

function checkSecretKey (req, res, next) {
  var secureKey = req.header('X-Runnable-Key');
  if (secureKey !== process.env.SECRET_API_KEY) {
    res.status(403).end();
  } else {
    next();
  }
}

app.post('/actions/kill/',
  checkSecretKey,
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