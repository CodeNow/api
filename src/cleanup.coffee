async = require 'async'
configs = require './configs'
containers = require './models/containers'
request = require 'request'
users = require './models/users'
_ = require 'lodash'

# initial mongodb cleanup
# If this script has not been run in a while, it's possible that the whitelist is large
# and the cron mongodb remove query uses an $in operator which is not the most efficient..
# Here we will remove unsaved, very expired containers from mongodb
week = (Date.now() - 1000*60*60*24*7)
query = saved:false, created:$lte:week
containers.count query, (err, count) ->
  if err then console.error(err) else
    containers.remove query, (err) ->
      if err then console.error(err) else
        console.log 'PURGE VERY EXPIRED DB CONTAINERS: ', count


hasRegisteredOwner = (container) ->
  registeredOwner = container.ownerJSON and container.ownerJSON.permission_level > 0
  return registeredOwner

getOwners = (domain, containers, cb) ->
  userIds = containers.map (container) ->
    container.owner.toString()
  query  = _id:$in:userIds
  fields = permission_level:1, _id:1
  users.find query, fields, domain.intercept (users) ->
    userHash = {}
    users.forEach (user) ->
      userHash[user._id] = user
    containers.forEach (container) ->
      container.ownerJSON = userHash[container.owner]
    cb null, containers

cleanupContainersNotIn = (domain, whitelist, cb) ->
  if whitelist.length is 0 then cb()
  whiteContainerIds = []
  whiteServiceTokens = []
  whitelist.forEach (container) ->
    whiteContainerIds.push container._id
    whiteServiceTokens.push container.serviceToken
  async.parallel [
    (cb) ->
      console.log('whitelistContainerIds: ', whiteContainerIds)
      containers.find _id:$nin:whiteContainerIds, domain.intercept (containers) -> # mongodb
        console.log 'PURGE DB CONTAINERS: ', containers.length
        cb()
  , (cb) -> # docker containers
      request
        url: "#{configs.harbourmaster}/containers/cleanup"
        method: 'POST'
        json: whiteServiceTokens
        pool: false
      , (err, res, body) ->
        if err then domain.emit 'error', err else
          if res.statusCode isnt 200
            cb status: 500, message: 'whitelist not accepted by harbourmaster', body: body
          else
            cb()
  ], cb

module.exports = (req, res) ->
  appError = (err) ->
    console.error 'ERROR:::\n', err
    status = err.status
    delete err.status
    res.json status || 403, err
  domain = req.domain
  users.findUser domain, _id: req.user_id, domain.intercept (user) ->
    if not user then appError message:'permission denied: no user' else
      if not user.isModerator then appError message:'permission denied' else
        containers.listSavedContainers req.domain, (containers) ->
          console.log 'SAVED CONTAINERS: ', containers.length
          getOwners domain, containers, (err) ->
            if err then sendError err else
              dateNow = Date.now()
              validContainers = containers.filter hasRegisteredOwner # technically filtering by reg. owners is not necessary bc only reg. users can save containers...
              console.log 'VALID CONTAINERS: ', validContainers.length
              cleanupContainersNotIn domain, validContainers, (err) ->
                if err then appError err else
                  res.json 200, message: 'successfuly sent prune request to harbourmaster and cleaned mongodb'