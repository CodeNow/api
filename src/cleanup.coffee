async = require 'async'
containers = require './models/containers'
request = require 'request'
users = require './models/users'

module.exports = (req, res) ->
  users.findUser _id: req.user_id, (err, user) ->
    if err then done err else
      if not user then cb() else
        if not user.isModerator() then res.json 403, message: 'permission denied' else
          containers.listAll req.domain, (containers) ->
            validContainers = [ ]
            async.forEach containers, (container, cb) ->
              users.findUser _id: container.owner, (err, user) ->
                if err then cb err else
                  if not user then cb() else
                    containerLife = (new Date()).getTime() - container.created.getTime()
                    if user.permission_level > 0 or containerLife < 3600000
                      validContainers.push container.servicesToken
                    cb()
            , (err) ->
              if err
                res.json 500, message: 'error sending cleanup request to harbourmaster'
              else
                res.json 200, message: 'successfuly sent cleanup request to harbourmaster'
              request
                url: "#{configs.harbourmaster}/containers/cleanup"
                method: 'POST'
                json: validContainers
              , (err, serverRes, body) ->
                if err then throw err
                if serverRes.statusCode isnt 200 then console.error err.stack