var route53 = require('./route53');
route53.start(); // must be before api require
var ApiServer = require('server');
var cleanMongo = require('./clean-mongo');
var cayley = require('./cayley');

var mongoose = require('mongoose');
var mongooseOptions = {};
if (process.env.MONGO_REPLSET_NAME) {
  mongooseOptions.replset = {
    rs_name: process.env.MONGO_REPLSET_NAME
  };
}
mongoose.connect(process.env.MONGO, mongooseOptions, function(err) {
  if (err) {
    debug('fatal error: can not connect to mongo', err);
    error.log(err);
    process.exit(1);
  }
});

module.exports = {
  start: startApi,
  stop: stopApi
};

var apiServer;
function startApi (done) {
  var ctx = this;
  ctx.cayley = cayley;
  route53.start(); // must be before api require, and here
  apiServer = new Api().start(function (err) {
    if (err) { return done(err); }
    cayley.start(function () {
      cleanMongo.removeEverything(done);
    });
  });
}

function stopApi (done) {
  route53.stop();
  apiServer.stop(function (err) {
    if (err) { return done(err); }
    cayley.stop(done);
    // cleanMongo.dropDatabase(done);
  });
}
