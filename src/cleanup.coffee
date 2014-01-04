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
onFirstRun = (cb) ->
  week = new Date(Date.now() - 1000*60*60*24*7)
  unsavedAndWayExpired = saved:false, created:$lte:week
  containers.count unsavedAndWayExpired, (err, count) ->
    if err then console.error(err) else
      containers.remove unsavedAndWayExpired, (err) ->
        if err then console.error(err) else
          console.log 'PURGE VERY EXPIRED DB CONTAINERS: ', count
          cb()

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
  whiteServicesTokens = []
  whitelist.forEach (container) ->
    whiteContainerIds.push container._id
    whiteServicesTokens.push container.servicesToken
  async.parallel [
    (cb) -> # mongodb containers
      notInWhitelist = _id:$nin:whiteContainerIds
      containers.count notInWhitelist, domain.intercept (count) ->
        containers.remove notInWhitelist, domain.intercept () ->
          cb()
  , (cb) -> # docker containers
      request
        url: "#{configs.harbourmaster}/containers/cleanup"
        method: 'POST'
        json: whiteServicesTokens
        pool: false
      , (err, res, body) ->
        if err then domain.emit 'error', err else
          if res.statusCode isnt 200
            cb status: 500, message: 'whitelist not accepted by harbourmaster', body: body
          else
            cb()
  ], cb

module.exports = (req, res) ->
  sendError = (err) ->
    console.error 'ERROR:::\n', err
    status = err.status
    delete err.status
    res.json status || 403, err
  async.series [
    (cb) ->
      if req.query.firstRun then onFirstRun(cb) else cb()
  , (cb) ->
      domain = req.domain
      users.findUser domain, _id: req.user_id, domain.intercept (user) ->
        if not user then cb message:'permission denied: no user' else
          if not user.isModerator then cb message:'permission denied' else
            containers.listSavedContainers req.domain, (containers) ->
              getOwners domain, containers, (err) ->
                if err then cb err else
                  dateNow = Date.now()
                  # technically filtering by reg. owners is not necessary 
                  # bc only reg. users can save containers...
                  validContainers = containers.filter hasRegisteredOwner 
                  cleanupContainersNotIn domain, validContainers, cb
  ], (err) -> #done
    if err then sendError err else
      res.json 200, message: 'successfuly sent prune request to harbourmaster and cleaned mongodb'
