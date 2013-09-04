async = require("async")
images = require("./lib/models/images")
users = require("./lib/models/users")
configs = require("./lib/configs")
dockerjs = require("docker.js")
domain = require("domain").create()
mongoose = require("mongoose")
mongoose.connect configs.mongo
docker = dockerjs(host: configs.direct_docker)
plus = /\+/g
slash = /\//g
encodeId = (id) ->
  (new Buffer(id.toString(), "hex")).toString("base64").replace(plus, "-").replace slash, "_"

images.find {}, (err, images) ->
  async.eachSeries images, ((item, callback) ->
    encodedId = undefined
    encodedId = encodeId(item._id)
    console.log "Pulling Image: " + encodedId + ". Docker Id: " + item._id
    setTimeout (->
      docker.createImage
        queryParams:
          fromImage: "registry.runnable.com/runnable/" + encodedId
          tag: "latest"
          registry: "registry.runnable.com"
      , (err, res) ->
        console.log res
        callback null

    ), 1000
  ), (err) ->
    console.log "done"

