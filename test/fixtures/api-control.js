var route53 = require('./route53');
route53.start(); // must be before api require
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
  route53.stop();
  api.stop(function (err) {
    if (err) { return done(err); }

    // cleanMongo.dropDatabase(done);
    done();
  });
}