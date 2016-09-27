db.contextversions.find({'build.dockerImage': {$exists: 1}}, {'build.dockerImage': 1}).forEach(function (cv) {
  print(cv.build.dockerImage)
})
