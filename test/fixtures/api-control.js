var Api = require('server');
var cleanMongo = require('./clean-mongo');

module.exports = {
  start: startApi,
  stop: stopApi
};

var api;
function startApi (done) {
  api = new Api().start(function (err) {
    if (err) { return done(err); }

    cleanMongo.removeEverything(done);
  });
}

function stopApi (done) {
  api.stop(function (err) {
    if (err) { return done(err); }

    // cleanMongo.dropDatabase(done);
    done();
  });
}