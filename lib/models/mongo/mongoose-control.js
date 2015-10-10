'use strict';

var noop = require('101/noop');
var mongoose = require('mongoose');
var mongooseControl = module.exports = {};

mongooseControl.start = function(cb) {
  cb = cb || noop;
  var mongooseOptions = {};
  if (process.env.MONGO_REPLSET_NAME) {
    mongooseOptions.replset = {
      rs_name: process.env.MONGO_REPLSET_NAME
    };
  }
  mongoose.connect(process.env.MONGO, mongooseOptions, cb);
};

mongooseControl.stop = function(cb) {
  cb = cb || noop;
  mongoose.disconnect(function(err) {
    // this sometimes calls back in sync
    process.nextTick(function() {
      cb(err);
    });
  });
};