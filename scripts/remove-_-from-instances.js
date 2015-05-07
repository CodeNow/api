'use strict';

require('loadenv')();
var Instances = require('models/mongo/instance');
var async = require('async');
var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);

var dryRun = !process.env.ACTUALLY_RUN;

console.log('dryRun?', !!dryRun);

async.waterfall([
  function getAllInstances (cb) {
    Instances.find({}, cb);
  },
  function rename (instances, cb) {
    console.log('looking at instances', instances.length);

    var reanameList = [];
    instances.forEach(function (i) {
      if (~i.name.indexOf('_')) {
        reanameList.push(i);
      }
    });

    async.eachLimit(reanameList, 10, function (i, eachCb) {
      var newName = i.name.replace(/[^a-zA-Z0-9]/g, '-');
      console.log('RENAMING', i.name, newName);
      if (dryRun) {
        return eachCb();
      }
      Instances.findOneAndUpdate({
        _id: i._id
      }, {
        $set: {
          name: newName
        }
      }, function (err) {
        if (err) { console.error('err renameing',i.name, newName, err.message); }
        eachCb();
      });
    }, cb);
  }
], function (err) {
  console.log('done. err', err);
  process.exit(0);
});
