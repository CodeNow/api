'use strict';
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_SOCKETTYPE,
  parser: 'JSON'
});

// proxy stream to destination
function primusProxy (primus) {
  // handle connection
  primus.on('connection', function (inSocket) {
    if (inSocket.query.type !== 'filibuster') {
      return;
    }
    var args = {};

    if (typeof inSocket.query.args === 'string') {
      args = JSON.parse(inSocket.query.args);
    } else if (typeof inSocket.query.args === 'object') {
      args = inSocket.query.args;
    }

    var outSocket = new Socket('http://' + args.dockHost + ':' + args.dockPort +
      '?type=' + args.type +
      '&args=' + JSON.stringify(args));

    inSocket.on('data', function(data) {
      console.log('inSocket', data);
      outSocket.write(data);
    });

    outSocket.on('data', function(data) {
      console.log('terminal', data);
      inSocket.write(data);
    });
  });
}

module.exports = primusProxy;
