'use strict'
var hrAgo = new ISODate()
// even works with 0-1 = 23 of prev day
hrAgo.setMinutes(hrAgo.getMinutes() - 30)

db.contextversions.find(
  { 'build.started': {$lte: hrAgo}, 'build.completed': {$exists: false} },
  { 'build.started': 1, 'build.completed': 1,  'appCodeVersions': 1 }
).forEach(function (cv) {
  var err = new Error('Timed out. Try a rebuild without cache.')
  var now = new ISODate()
  db.contextversions.update({ _id: cv._id }, {
    $set: {
      'build.completed': now,
      'build.duration': now - cv.build.started,
      'build.error.message': err.message,
      'build.error.stack': err.stack,
      'build.log': '',
      'build.failed': true
    }
  })
  var found = db.contextversions.findOne({ _id: cv._id })
  if (found.build.completed &&
    found.build.duration &&
    found.build.error.message &&
    found.build.error.stack
  ) {
    print(cv._id.toString() + 'updated')
  } else {
    print(cv._id.toString() + 'fail')
  }
})
