db.instances.find({'container.dockerContainer': {$exists: 1}}, {'container.dockerContainer': 1}).forEach(function (i) {
  print(i.container.dockerContainer)
})
