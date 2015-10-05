'use strict';
var hrAgo = new ISODate();
// even works with 0-1 = 23 of prev day
hrAgo.setHours(hrAgo.getHours() - 1);

db.contextversions.find({
  'build.error.message': 'Timed out. Try a rebuild without cache.'
}).forEach(function (cv) {
  db.builds.find({
    contextVersions: cv._id,
    completed: {$exists:false}
  }).forEach(function (build) {
    var found = db.builds.findOne({ _id: build._id, completed: { $exists:0 } });
    printjson(found);
    db.builds.update({ _id: build._id, completed: { $exists: 0 } }, {
      $set: {
        failed   : true,
        completed: cv.build.completed,
        duration : cv.build.duration
      }
    });
    found = db.builds.findOne({ _id: build._id });
    if (found) {
      if (found.failed &&
          found.completed &&
          found.duration
      ) {
        print(found._id.toString() + 'updated');
      }
      else {
        print(found._id.toString() + 'fail');
      }
    }
  });
});
