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
  var client = new primusClient(
    'http://' +
    process.env.IPADDRESS +
    ':' +
    process.env.PORT +
    "?type=build-stream&id=" + contextVersionId);

  var log = '';
  client.on('err', function (err) {
    cb(err);
  });
  client.on('end', function () {
    // FIXME: get rid of timeout issue
    setTimeout(function () {
      // build is marked completed a few ms after the version build completes
      cb(null, log);
    }, 30);
  });
  client.on('data', function(data) {
    log += data;
  });
  if (!cb) {
    return client;
  }
}