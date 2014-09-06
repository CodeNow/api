var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

module.exports = tailBuildStream;

function tailBuildStream (contextVersionId, cb) {
  require('./mocks/docker/container-id-attach')();

  var client = new primusClient(
    'http://localhost:' +
    process.env.PORT);

  // start build stream
  client.write({
    id: 1,
    event: 'build-stream',
    data: {
      id: contextVersionId,
      streamId: contextVersionId
    }
  });

  client.on('data', function(msg) {
    if (msg.error) {
      throw new Error(JSON.stringify(msg));
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