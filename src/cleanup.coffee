async = require 'async'
configs = require './configs'
containers = require './models/containers'
request = require 'request'
users = require './models/users'
_ = require 'lodash'

hasRegisteredOwner = (container) ->
  registeredOwner = container.ownerJSON and container.ownerJSON.permission_level > 0
  return registeredOwner

getOwners = (domain, containers, cb) ->
  userIds = containers.map (container) ->
    container.owner.toString()
  users.publicListWithIds domain, userIds, domain.intercept (users) ->
    userHash = {}
    users.forEach (user) ->
      userHash[user._id] = user.toJSON()
    containers.forEach (container) ->
      container.ownerJSON = userHash[container.owner]
    cb null, containers

cleanupContainersNotIn = (domain, whitelist, cb) ->
  if whitelist.length === 0 then cb()
  containerIds = []
  serviceTokens = []
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
          if res.statusCode !== 200
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
              dateNow = (new Date()).getTime()
              validContainers = containers.filter hasRegisteredOwner # technically filtering by reg. owners is not necessary bc only reg. users can save containers...
              console.log 'VALID CONTAINERS: ', validContainers.length
              cleanupContainersNotIn domain, validContainers, (err) ->
                if err then appError err else
                  res.json 200, message: 'successfuly send prune request harbourmaster'

