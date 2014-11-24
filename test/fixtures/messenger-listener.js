var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

module.exports = emitListen;

function emitListen (cb) {
  var client = new primusClient(
    'http://localhost:' +
    process.env.PORT);

  client.on('data', cb);
}