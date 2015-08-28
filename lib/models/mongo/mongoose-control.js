'use strict';

var noop = require('101/noop');
var mongoose = require('mongoose');
var createCount = require('callback-count');

var mongooseControl = module.exports = {};

function checkIfDisconnected (cb) {
  var badConnection;
  if (mongoose.connections.some(function (connection) {
      if (connection.readyState !== 0) {
        badConnection = connection;
        return true;
      }
    })) {
    console.log(
      '\nSTOP MONGOOSE STILL NOT DISCONNECTED',
      mongoose.STATES[badConnection.readyState]
    );
    setTimeout(checkIfDisconnected, 100);
  } else {
    console.log('\nSTOP MONGOOSE state', mongoose.STATES[mongoose.connection.readyState]);
    cb();
  }
}
mongooseControl.start = function (cb) {
  cb = cb || noop;
  var mongooseOptions = {};
  if (process.env.MONGO_REPLSET_NAME) {
    mongooseOptions.replset = {
      rs_name: process.env.MONGO_REPLSET_NAME
    };
  }
  var count = createCount(function () {
    mongoose.connect(process.env.MONGO, mongooseOptions, cb);
  });

  console.log('\nSTART MONGOOSE connection count', mongoose.connections.length);
  if (mongoose.connections.some(function (connection) {
      if (connection.readyState !== 0) {
        return true;
      }
    })) {
    this.stop(count.inc().next);
  }
  count.next();
};

mongooseControl.stop = function (cb) {
  mongoose.disconnect(function (err) {
    // this sometimes calls back in sync
    if (err) {
      return cb(err);
    }
    checkIfDisconnected(cb);
  });
};