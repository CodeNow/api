'use strict';

var ip = require('ip');
var apiServer = require('../../app.js').apiServer;
var debug = require('debug')('runnable-api:socket:socket-client');


function SocketClient () {
  var PrimusSocket = apiServer.socketServer.primus.Socket;

  var url = 'http://' + ip.address() + ':' + process.env.PORT;
  this.primusClient = new PrimusSocket(url);
  this.primusClient.on('error', function (err) {
    console.log('primus error', err);
  });
  this.primusClient.on('data', function (data) {
    console.log('primus data', data);
  });
}


SocketClient.prototype.joinOrgRoom = function (orgId) {
  this.primusClient.write({
    id: orgId,
    event: 'subscribe',
    data: {
      action: 'join',
      type: 'org',
      name: orgId
    }
  });
};


SocketClient.prototype.leaveOrgRoom = function (orgId) {
  this.primusClient.write({
    id: orgId,
    event: 'subscribe',
    data: {
      action: 'leave',
      type: 'org',
      name: orgId
    }
  });
};


module.exports = new SocketClient();