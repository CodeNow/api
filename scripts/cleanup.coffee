async = undefined
configs = undefined
containers = undefined
docker = undefined
dockerjs = undefined
domain = undefined
mongoose = undefined
users = undefined
containers = require("./libs/models/containers")
users = require("./libs/models/users")
configs = require("./libs/configs")
dockerjs = require("docker.js")
domain = require("domain").create()
mongoose = require("mongoose")
async = require("async")
mongoose.connect configs.mongo
docker = dockerjs(host: configs.direct_docker)
domain.on "error", (err) ->
  console.error "CLEANUP ERROR:", err.stack
  process.exit 1


doRemove = ->
  docker.listContainers
    queryParams:
      all: true
  , domain.intercept((list) ->
    async.filterSeries list, ((dockerContainer, cb) ->
      docker_id = undefined
      docker_id = undefined
      docker_id = dockerContainer.Id.substring(0, 12)
      if /^Up /.test(dockerContainer.Status)
        cb false
      else
        containers.findOne
          docker_id: docker_id
        , domain.intercept((mongoContainer) ->
          if (mongoContainer?) or mongoContainer.deleted
            cb true
          else
            users.findOne
              _id: mongoContainer.owner
            , domain.intercept((user) ->
              if (user?) and user.registered
                cb false
              else
                cb true
            )
        )
    ), (filtered) ->
      async.eachLimit filtered, 1, ((dockerContainer, cb) ->
        console.log "Removing " + dockerContainer.Id
        setTimeout (->
          docker.removeContainer
            id: dockerContainer.Id
          , (err) ->
            if err?
              console.error "failed to remove", dockerContainer.Id
              cb null
            else
              containers.remove
                docker_id: dockerContainer.Id.substring(0, 12)
              , domain.intercept(->
                cb null
              )

        ), 1000
      ), domain.intercept(->
        setTimeout doRemove, 60 * 60 * 1000
      )

  )
doRemove()
