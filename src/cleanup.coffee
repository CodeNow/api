async = require 'async'
configs = require './configs'
containers = require './models/containers'
request = require 'request'
users = require './models/users'

module.exports = (req, res) ->
  users.findUser req.domain, _id: req.user_id, (err, user) ->
    if err then done err else
      if not user then cb() else
        if not user.isModerator then res.json 403, message: 'permission denied' else
          containers.listAll req.domain, (containers) ->
            validContainers = [ ]
            async.forEach containers, (container, cb) ->
              users.findUser req.domain, _id: container.owner, (err, user) ->
                if err then cb err else
                  if not user then cb() else
                    containerLife = (new Date()).getTime() - container.created.getTime()
                    if user.permission_level > 0 or containerLife < 3600000
                      validContainers.push container.servicesToken
                    cb()
            , (err) ->
              if err then res.json 500, message: 'error computing container whitelist' else
                request
                  url: "#{configs.harbourmaster}/containers/cleanup"
                  method: 'POST'
                  json: validContainers
                , (err, serverRes, body) ->
                  if err then throw err
                  console.log body
                  if serverRes.statusCode isnt 200 then res.json 500, message: 'whitelist not accepted by harbourmaster' else
                    res.json 200, message: 'successfuly send prune request harbourmaster'
