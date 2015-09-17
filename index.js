'use strict';
var log = require('middlewares/logger')(__filename).log;

require('./app').start();

process.on('SIGINT', handleStopSignal.bind(null, 'SIGINT'));
process.on('SIGTERM', handleStopSignal.bind(null, 'SIGTERM'));
function handleStopSignal (signal) {
  // This handler must exist or node will "hard" exit the process
  log.info(signal+' signal recieved');
}