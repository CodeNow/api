var count = 0
db.contextversions.find({
  'build.dockerTag': {$exists: false},
  'build.created': {$exists: false}
}, {
  _id: 1,
  context: 1,
  'build.completed': 1,
  'build.started': 1,
  'build.dockerTag': 1,
  'appCodeVersions': 1
}).forEach(function (cv) {
  var context = db.contexts.findOne({ _id: cv.context }, {_id: 1})
  var instance = db.instances.findOne({ 'contextVersion._id': cv._id }, { name: 1 })
  if (!context && !instance) {
    print('remove! ' + cv._id)
    db.contextversions.remove({ _id: cv._id })
  }
})
