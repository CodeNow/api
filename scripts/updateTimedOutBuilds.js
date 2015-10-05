'use strict';
require('loadenv')();

var ContextVersions = require('models/mongo/context-version');
var Build = require('models/mongo/build');

var dryRun = !process.env.ACTUALLY_RUN;

console.log('dryRun?', !!dryRun);

var async = require('async');
var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);

async.waterfall([
  function getAllCv (cb) {
    ContextVersions.find({
      'build.error.message': 'Timed out. Try a rebuild without cache.'
    }, cb);
  },
  function getAllCv (cvs, cb) {
    if (typeof cvs !== 'object') {
      return cb(new Error('cv not array'));
    }
    if (cvs.length <= 0) {
      return cb(new Error('nothing found for cvs'));
    }

    console.log('handling', cvs.length, 'cvs');
    var count = 0;
    async.eachLimit(cvs, 1, function (cv, eachCb) {
      Build.find({
        contextVersions: cv._id,
        completed: { $exists: false }
      }, function (err, builds) {
        count++;
        if (err) {
          console.log('Build find err', err, count+'/'+cvs.length);
          return eachCb();
        }
        if (typeof builds !== 'object') {
          console.log('builds not array', count+'/'+cvs.length);
          return eachCb();
        }
        if (builds.length <= 0) {
          console.log('nothing found for builds', count+'/'+cvs.length);
          return eachCb();
        }
        console.log('handling', builds.length, 'builds', count+'/'+cvs.length);
        async.eachLimit(builds, 1, function (build, _eachCb) {
          Build.findOne({ _id: build._id, completed: { $exists: 0 }}, function (err) {
            if (err) {
              console.log('findOne err', build._id, err);
              return _eachCb();
            }
            console.log('updating', build._id);
            if (dryRun) { return; }
            Build.update({ _id: build._id, completed: { $exists: 0 }}, {
              $set: {
                failed   : true,
                completed: cv.build.completed,
                duration : cv.build.duration
              }
            });
          }, function (err) {
            if (err) { console.log('update err', build._id, err); }
            _eachCb();
          });
        }, eachCb);
      });
    }, cb);
  }], function (err) {
    if (err) { console.log('some err', err); }
    console.log('done... disconnect from mongo');
    mongoose.disconnect(function (err) {
      console.log('DONE!', err);
      process.exit(0);
    });
  });