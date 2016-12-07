/**
 * Wrapped functionality of Datadog API
 * @module lib/models/datadog/index
 */
'use strict'
var StatsD = require('node-dogstatsd').StatsD
var client = module.exports = new StatsD(
  process.env.DATADOG_HOST,
  process.env.DATADOG_PORT)
var exec = require('child_process').exec

function captureSocketCount () {
  var sockets = require('http').globalAgent.sockets
  var request = require('http').globalAgent.requests
  var key

  for (key in sockets) {
    client.gauge('api.sockets_open', sockets[key].length, 1,
      ['target:' + key, 'pid:' + process.pid])
  }

  for (key in request) {
    client.gauge('api.sockets_pending', request[key].length, 1,
      ['target:' + key, 'pid:' + process.pid])
  }

  exec('lsof -p ' + process.pid + ' | wc -l', function (err, stdout) {
    if (err) { return }
    client.gauge('api.openFiles', parseInt(stdout, 10), 1, ['pid:' + process.pid])
  })
}

var interval

function monitorStart () {
  if (interval) { return }
  interval = setInterval(captureSocketCount, process.env.MONITOR_INTERVAL)
}

function monitorStop () {
  if (interval) {
    clearInterval(interval)
    interval = null
  }
}

module.exports.monitorStart = monitorStart
module.exports.monitorStop = monitorStop
