'use strict';
var url = require('url');
var Primus = require('primus');
var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

/** proxy stream to destination
  dockHost = host dock formatted like http://192.16.13.5:9123
  type = what you are connecting to
  containerId = of the container you wish to connect to
  terminalStreamId = ID of terminal substeam to create
  clientStreamId = ID of client substream to create
*/
/*jshint maxcomplexity:6*/
function proxyStreamHandler (socket, id, data) {
  // check required args
  if (!data.dockHost ||
    !data.type ||
    !data.containerId ||
    !data.terminalStreamId ||
    !data.eventStreamId) {
    return socket.write({
      id: id,
      error: 'dockHost, type, containerId, ' +
        'terminalStreamId, clientStreamId, are required',
      data: data
    });
  }

  var clientTermStream = socket.substream(data.terminalStreamId);
  var clientEventStream = socket.substream(data.eventStreamId);

  var parsedHost = url.parse(data.dockHost);
  var destStream = new Socket('http://' +
    parsedHost.hostname +
    ':' +
    process.env.FILIBUSTER_PORT +
    '?type=' + data.type +
    '&args=' + JSON.stringify(data));

  var destTermStream = destStream.substream('terminal');
  var destEventStream = destStream.substream('clientEvents');

  // end connection on disconnect
  joinEnds(socket, destStream);

  joinStreams(clientTermStream, destTermStream);
  joinStreams(clientEventStream, destEventStream);

  destStream.on('open', function(){
    socket.write({
      id: id,
      event: 'TERM_STREAM_CREATED',
      data: {
        substreamId: data.containerId
      }
    });
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

function joinEnds(src, des) {
  src.on('end', function() {
    des.end();
  });

  des.on('end', function() {
    src.end();
  });
}

module.exports.proxyStreamHandler = proxyStreamHandler;
