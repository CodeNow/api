docker = require("../lib/dockerProxy.js")
async = require("async")
docker.listImages (err, images) ->
  imageHash = {}
  i = 0

  while i < images.length
    imageId = images[i].Id
    if imageHash[imageId]
      imageHash[imageId].push imageId
    else
      imageHash[imageId] = [images[i].Repository]
    i++
  imagesToTag = []
  for imageId of imageHash
    imagesToTag.push imageId  if imageHash[imageId].indexOf("registry.runnable.com/images") < 0
  console.log imagesToTag
  async.eachSeries imagesToTag, ((item, callback) ->
    console.log "tagging image"
    console.log item
    docker.tagImage
      id: item
      queryParams:
        repo: "registry.runnable.com/images"
    , (res, err) ->
      console.log arguments_

  ), (err) ->
    console.log "done"
