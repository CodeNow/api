async = require("async")
images = require("../models/images")
users = require("../models/users")
configs = require("../configs")
dockerjs = require("docker.js")
domain = require("domain").create()
mongoose = require("mongoose")
mongoose.connect configs.mongo
docker = dockerjs(host: configs.docker)
plus = /\+/g
slash = /\//g

encodeId = (id) ->
  (new Buffer(id.toString(), "hex")).toString("base64").replace(plus, "-").replace slash, "_"

images.find {}, (err, images) ->
  async.eachSeries images, ((item, callback) ->
    encodedId = encodeId(item._id)
    console.log "Tagging Image: " + encodedId + ". Docker Id: " + item._id
    docker.tagImage
      id: item.docker_id
      queryParams:
        repo: "registry.runnable.com/runnable/" + encodedId
    , (err, res) ->
      console.log res
      setTimeout (->
        docker.pushImage
          id: "registry.runnable.com/runnable/" + encodedId
        , (err, res) ->
          console.log res
          callback null

      ), 2000

  ), (err) ->
    console.log "done"
