// var cleanMongo = require('./clean-mongodb');

module.exports = stopApi;

function stopApi (done) {
  this.api.stop(function (err) {
    if (err) { return done(err); }

    // cleanMongo.dropDatabase(done);
    done();
  });
  delete this.api;
}