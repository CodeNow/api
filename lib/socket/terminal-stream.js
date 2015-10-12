/**
 * used to create a bash session into a terminal
 * streams are means of communication
 * @module lib/socket/terminal-stream
 */
'use strict';

var pump = require('substream-pump');
var Docker = require('models/apis/docker.js');
var dogstatsd = require('models/datadog');
var streamCleanser = require('docker-stream-cleanser')();
var log = require('middlewares/logger')(__filename).log;
var put = require('101/put');

var baseDataName = 'api.socket.terminal';

module.exports = Terminal;

function Terminal (socket, id, data) {
  log.info({
    id: id,
    data: data
  }, 'Terminal constructor');
  this.socket = socket;
  this.id = id;
  this.data = data;
}

/**
 * Creates term objects and sets up streams
 * @param  {Object} socket client socket
 * @param  {String} id     unique socket id
 * @param  {Object} data   containers connection information
 *   data.dockHost = host dock formatted like http://192.16.13.5:9123
 *   data.type = what you are connecting to
 *   data.containerId = of the container you wish to connect to
 *   data.terminalStreamId = ID of terminal substeam to create
 * @returns {unknown} unused
 */
Terminal.proxyStreamHandler = function (socket, id, data) {
  if (!data.dockHost ||
    !data.containerId ||
    !data.terminalStreamId) {
    dogstatsd.increment(baseDataName + '.err.invalid_args');
    return socket.write({
      id: id,
      error: 'dockHost, containerId, terminalStreamId are required',
      data: data
    });
  }
  var term = new Terminal(socket, id, data);
  term.init();
};

/**
 * create bash session and setup streams
 */
Terminal.prototype.init = function () {
  var self = this;
  var data = self.data;
  dogstatsd.increment(baseDataName + '.connections');

  var docker = new Docker(data.dockHost);
  docker.execContainer(data.containerId, function (err, stream) {
    if (err) {
      return self.handleErr(err, 'Docker.prototype.execContainer exec error');
    }
    self.setupStreams(stream);
  });
};

/**
 * pumps exec stream from container to client stream
 * @param  {Object} stream exec stream from container
 */
Terminal.prototype.setupStreams = function (stream) {
  var self = this;

  var clientTermStream = self.socket.substream(self.data.terminalStreamId);

  stream.setEncoding('utf8');
  // pipe does not work on client stream
  stream
    .pipe(streamCleanser)
    .on('data', function (data) {
      clientTermStream.write(data.toString());
    });

  pump(clientTermStream, stream);

  dogstatsd.captureSteamData(baseDataName + '.clientTermStream', clientTermStream);
  dogstatsd.captureSteamData(baseDataName + '.destTermStream', stream);

  stream.on('open', function () {
    self.socket.write({
      id: self.id,
      event: 'TERM_STREAM_CREATED',
      data: {
        substreamId: self.data.containerId
      }
    });
  });
};

/**
 * logs any errors and closes the stream
 * @param  {Object} err error to log
 * @param  {Stream} msg message to log
 */
Terminal.prototype.handleErr = function (err, msg) {
  log.error(put({
    err: err
  }, this.logData), msg);

  this.stream.close();
};
