'use strict';
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

/** proxy stream to destination
  dockPort = port of dock box to connect to
  dockHost = host dock
  type = what you are connecting to
  containerId = of the container you wish to connect to
  terminalStreamId = ID of terminal substeam to create
  clientStreamId = ID of client substream to create
*/
/*jshint maxcomplexity:7*/
function proxyStreamHandeler (socket, id, data) {
  // check required args
  if (!data.dockPort ||
    !data.dockHost ||
    !data.type ||
    !data.containerId ||
    !data.terminalStreamId ||
    !data.eventStreamId) {
    return socket.write({
      id: id,
      error: 'dockPort, dockHost, type, containerId, ' +
        'terminalStreamId, clientStreamId, are required',
      data: data
    });
  }

  var clientTermStream = socket.substream(data.terminalStreamId);
  var clientEventStream = socket.substream(data.eventStreamId);

  var destStream = new Socket('http://' + data.dockHost + ':' + data.dockPort +
    '?type=' + data.type +
    '&args=' + JSON.stringify(data));

  var destTermStream = destStream.substream('terminal');
  var destEventStream = destStream.substream('clientEvents');

  // end connection on disconnect
  socket.on('end', function(){
    destStream.end();
  });

  joinStreams(clientTermStream, destTermStream);
  joinStreams(clientEventStream, destEventStream);
  // return to client id to listen too
  socket.write({
    id: id,
    event: 'TERM_STREAM_CREATED',
    data: {
      substreamId: data.containerId
    }
  });
}

function joinStreams(src, des) {
  src.on('data', function(data) {
    des.write(data);
  });

  des.on('data', function(data) {
    src.write(data);
  });
}

module.exports.proxyStreamHandeler = proxyStreamHandeler;
