var Api = require('index');
var cleanMongo = require('./clean-mongo');

module.exports = startApi;

function startApi (done) {
  this.api = new Api().start(function (err) {
    if (err) { return done(err); }

    cleanMongo.removeEverything(done);
  });
}