var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

module.exports = tailBuildStream;

function tailBuildStream (contextVersionId, failure, cb) {
  if (typeof failure === 'function') {
    cb = failure;
    failure = null;
  }
  require('./mocks/docker/container-id-attach')(0, failure);
  var client = new primusClient(
    'http://localhost:' +
    process.env.PORT);
  // create substream for build logs
  var buildStream = client.substream(contextVersionId);

  // start build stream
  client.write({
    id: 1,
    event: 'build-stream',
    data: {
      id: contextVersionId,
      build: {},
      streamId: contextVersionId,
      substreamId: contextVersionId
    }
  });

  var log = '';
  buildStream.on('data', function(data) {
    log += data;
  });

  client.on('data', function(msg) {
    if (msg.error) {
      client.end();
      if (failure) {
        return cb(null, msg);
      } else {
        return cb(new Error(JSON.stringify(msg.error)));
      }
    }
    if(msg.event === 'BUILD_STREAM_ENDED' &&
      msg.data.id === contextVersionId) {
      client.end();
      return cb(null, msg.data.log);
    }
  });

  if (!cb) {
    return client;
  }
}