'use strict';

/**
 * Kill the server
 * @module rest/actions/kill
 * stop listening for event
 * stop listening for http calls
 * wait for all sockets to die
 * process.kill(0) after all sockets are gone
 */

// TODO: later

// var express = require('express');
// var app = module.exports = express();

// app.post('/actions/kill/',
//   checkSecretKey,
//   function (req, res, next) {
//     var api = require('../../../app')();
//     api.stop(function (err) {
//       if (err) { return next(err); }
//       res.status(204).end();
//     });
//   });

// function checkSecretKey (req, res, next) {
//   var secureKey = req.header('X-Runnable-Key');
//   if (secureKey !== process.env.SECRET_API_KEY) {
//     res.status(403).end();
//   } else {
//     next();
//   }
// }