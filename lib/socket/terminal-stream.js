/**
 * TODO document
 * @module lib/socket/terminal-stream
 */
'use strict';

var pump = require('substream-pump');
var Docker = require('models/apis/docker.js');
var dogstatsd = require('models/datadog');
var streamCleanser = require('docker-stream-cleanser')();

module.exports.proxyStreamHandler = proxyStreamHandler;

var baseDataName = 'api.socket.terminal';

/** proxy stream to destination
  dockHost = host dock formatted like http://192.16.13.5:9123
  type = what you are connecting to
  containerId = of the container you wish to connect to
  terminalStreamId = ID of terminal substeam to create
  clientStreamId = ID of client substream to create
*/
function proxyStreamHandler (socket, id, data) {
  dogstatsd.increment(baseDataName + '.connections');
  // check required args
  if (!data.dockHost ||
    !data.type ||
    !data.containerId ||
    !data.terminalStreamId ||
    !data.eventStreamId) {
    dogstatsd.increment(baseDataName + '.err.invalid_args');
    return socket.write({
      id: id,
      error: 'dockHost, type, containerId, ' +
        'terminalStreamId, clientStreamId, are required',
      data: data
    });
  }

  var clientTermStream = socket.substream(data.terminalStreamId);

  var d = new Docker(data.dockHost);
  var container = d.docker.getContainer(data.containerId);
  var options = {
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ['bash']
  };
  container.exec(options, function (err, exec) {
    if (err) { return console.log('2', err); }

    exec.start({ stdin: true }, function (err2, stream) {
      if (err2) { return console.log('3', err2); }

      stream.setEncoding('utf8');
      stream
        .pipe(streamCleanser)
        .on('data', function(d) {
          clientTermStream.write(d.toString());
        })

      pump(clientTermStream, stream);

      stream.on('open', function () {
        socket.write({
          id: id,
          event: 'TERM_STREAM_CREATED',
          data: {
            substreamId: data.containerId
          }
        });
      });
    });
  });
}
