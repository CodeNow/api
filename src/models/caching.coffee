async = require 'async'
channels = require './channels'
configs = require '../configs'
images = require './images'
redis = require 'redis'
users = require './users'

listFields =
  _id:1,
  name:1,
  tags:1,
  owner:1,
  created:1

redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress)


markCacheAsDirty = () ->
  redis_client.set "sort_cache.dirty", 'true', (err) ->
    if err then console.error err

markCacheAsClean = (cb) ->
  redis_client.set "sort_cache.dirty", 'false', (err) ->
    if err then cb err else
      cb()

isCacheDirty = (cb) ->
  redis_client.get "sort_cache.dirty", (err, value) ->
    if err then cb err else
      cb null, (not value) or (value is 'true') 

getUnfilteredCachedResults = (limit, index, cb) ->
  redis_client.get "sort_cache.#{limit}-#{index}", (err, value) ->
    if err then cb err else
      if value then cb null, JSON.parse value else
        updateSingleUnfilteredCachedResult limit, index, (err, value) ->
          if err then cb err else
            cb null, value

getFilteredCachedResults = (limit, index, channels, cb) ->
  images.find 'tags.channel': $in: channels, listFields, (err, selected) ->
    if err then cb err else
      filter = [ ]
      for image in selected
        filter.push image._id
      key = "sort_cache.#{limit}-#{index}"
      channels.forEach (channel) ->
        key = "#{key}-#{channel}"
      redis_client.get key, (err, value) ->
        if err then cb err else
          if value then cb null, JSON.parse value else
            updateSingleFilteredCachedResult limit, index, channels, (err, value) ->
              if err then cb err else
                cb null, value

updateSingleUnfilteredCachedResult = (limit, index, cb) ->
  users.aggregate voteSortPipeline(limit, index), (err, results) ->
    if err then cb err else
      redis_client.set "sort_cache.#{limit}-#{index}", JSON.stringify(results), (err) ->
        if err then cb err else
          cb null, results

updateSingleFilteredCachedResult = (limit, index, channels, cb) ->
  images.find 'tags.channel': $in: channels, listFields, (err, selected) ->
    if err then cb err else
      filter = [ ]
      for image in selected
        filter.push image._id
      users.aggregate voteSortPipelineFiltered(limit, index, filter), (err, results) ->
        if err then cb err else
          key = "sort_cache.#{limit}-#{index}"
          channels.forEach (channel) ->
            key = "#{key}-#{channel}"
          redis_client.set key, JSON.stringify(results), (err) ->
            if err then cb err else
              cb null, results

updateAllUnfilteredCachedResults = (cb) ->
  limit = configs.defaultPageLimit
  users.aggregate voteSortPipelineAll(), (err, results) ->
    if err then cb err else
      num_pages = Math.ceil(results.length/limit)
      indices = for i in [ 0 ... num_pages ]
        i*limit
      async.forEach indices, (index, cb) ->
        page = results.slice index, index + limit
        redis_client.set "sort_cache.#{limit}-#{index}", JSON.stringify(page), cb
      , cb

updateFilteredCachedResults = (channels, cb) ->
  images.find 'tags.channel': $in: channels, listFields, (err, selected) ->
    if err then cb err else
      filter = [ ]
      for image in selected
        filter.push image._id
      limit = configs.defaultPageLimit
      users.aggregate voteSortPipelineFilteredAll(filter), (err, results) ->
        if err then cb err else
          num_pages = Math.ceil(results.length/limit)
          indices = for i in [ 0 ... num_pages ]
            i*limit
          async.forEach indices, (index, cb) ->
            page = results.slice index, index + limit
            key = "sort_cache.#{limit}-#{index}"
            channels.forEach (channel) ->
              key = "#{key}-#{channel}"
            redis_client.set key, JSON.stringify(page), cb
          , cb

updateAllFilteredCachedResults = (cb) ->
  channels.find { }, (err, results) ->
    results = results or [ ]
    async.forEachSeries results, (channel, cb) ->
      updateFilteredCachedResults [ channel._id ], cb
    , cb

updateAllCaches =  (req, res) ->
  users.findUser req.domain, _id: req.user_id, (err, user) ->
    if err then res.json 500, message: 'error looking up user in mongodb' else
      if not user then res.json 500, message: 'user not found' else
        if not user.isModerator then res.json 403, message: 'permission denied' else
          isCacheDirty (err, dirty) ->
            if err then res.json 500, message: 'error checking cache dirty flag' else
              if not dirty then res.json message: 'cache is not dirty, skipping refresh' else
                markCacheAsClean (err) ->
                  if err then res.json 500, message: 'error marking cache as clean' else
                    updateAllFilteredCachedResults (err) ->
                      if err then res.json 500, message: 'error refreshing filtered redis cache' else
                        updateAllUnfilteredCachedResults (err) ->
                          if err then res.json 500, message: 'error refreshing redis cache' else
                            res.json message: 'redis cache refreshed'

voteSortPipeline = (limit, index) ->
  [
    {
      $project:
        _id: 0
        votes: '$votes.runnable'
    },
    { $unwind: '$votes' },
    { $group:
        _id: '$votes'
        number:
          $sum: 1
    },
    {
      $sort: number: -1
    },
    {
      $skip: index
    },
    {
      $limit: limit
    }
  ]

voteSortPipelineFiltered = (limit, index, filter) ->
  [
    {
      $project:
        _id: 0
        votes: '$votes.runnable'
    },
    { $unwind: '$votes' },
    { $match: { votes: { $in: filter } } },
    { $group:
        _id: '$votes'
        number:
          $sum: 1
    },
    {
      $sort: number: -1
    },
    {
      $skip: index
    },
    {
      $limit: limit
    }
  ]

voteSortPipelineAll = () ->
  [
    {
      $project:
        _id: 0
        votes: '$votes.runnable'
    },
    { $unwind: '$votes' },
    { $group:
        _id: '$votes'
        number:
          $sum: 1
    },
    {
      $sort: number: -1
    }
  ]

voteSortPipelineFilteredAll = (filter) ->
  [
    {
      $project:
        _id: 0
        votes: '$votes.runnable'
    },
    { $unwind: '$votes' },
    { $match: { votes: { $in: filter } } },
    { $group:
        _id: '$votes'
        number:
          $sum: 1
    },
    {
      $sort: number: -1
    }
  ]

module.exports = {
  voteSortPipelineFiltered
  getUnfilteredCachedResults
  getFilteredCachedResults
  updateAllCaches
  markCacheAsDirty
}
