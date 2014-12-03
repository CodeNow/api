var route53 = require('./route53');
route53.start(); // must be before api require
var Api = require('server');
var cleanMongo = require('./clean-mongo');

module.exports = {
  start: startApi,
  stop: stopApi
};

function startApi (done) {
  global.apiServer = new Api().start(function (err) {
    if (err) { return done(err); }
    cleanMongo.removeEverything(done);
  });
}

function stopApi (done) {
  route53.stop();
  global.apiServer.stop(function (err) {
    if (err) { return done(err); }

    // cleanMongo.dropDatabase(done);
    done();
  });
}
