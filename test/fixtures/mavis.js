var mavisApp = require('mavis');
var url = require('url');
var createCount = require('callback-count');
var MavisModel = require('models/apis/mavis');
var mavisModel = new MavisModel();
var mavisDockData = require('mavis/lib/models/dockData');
var debug = require('debug')('runnable-api:mavis:mock');

function MavisMock () {}

MavisMock.prototype.start = function (cb) {
  debug('start');
  var count = createCount(cb);
  this.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port);
  this.mavis.on('listening', count.inc().next);

  count.inc();
  var retries = 0;
  var maxRetries = 20;
  checkIfMavisHasDocks();
  function checkIfMavisHasDocks () {
    retries++;
    if (retries === maxRetries) {
      return cb(new Error('mavis never got docks'));
    }
    mavisModel.getDocks(function (err, res) {
      debug('checkIfMavisHasDocks', res.body);
      if (err) { return count.next(err); }
      var docks = res.body;
      if (docks.length === 0) {
        // checkIfMavisHasDocks();
        count.next();
      }
      else {
        count.next();
      }
    });
  }
};

MavisMock.prototype.stop = function (cb) {
  debug('stop');
  var self = this;
  mavisModel.getDocks(function (err, res) {
    if (err) { return count.next(err); }
    var docks = res.body;
    var count = createCount(cb);
    docks.forEach(function (dock) {
      debug('delete', dock);
      mavisDockData.deleteHost(dock, count.inc().next); // init mavis docks data
    });
    self.mavis.close(count.inc().next);
  });
};

module.exports = new MavisMock();