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
          if value then cb null, JOSN.parse value else
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
      num_pages = Math.ceil(results/limit)
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
          num_pages = Math.ceil(results/limit)
          indices = for i in [ 0 ... num_pages ]
            i*limit
          async.forEach indices, (index, cb) ->
            page = results.slice index, index + limit
            key = "sort_cache.#{limit}-#{index}"
            channels.forEach (channel) ->
              key = "#{key}-#{channel}"
            redis_client.set key, JSON.stringify(page), cb
          , cb

updateAllFilteredCachedResults = (query, cb) ->
  channels.find { }, (err, results) ->
    results = results or [ ]
    async.forEach results, (channel, cb) ->
      updateFilteredCachedResults [ channel ], cb
    , cb

updateAllCaches =  (cb) ->
  updateAllUnfilteredCachedResults (err) ->
    if err err then cb err else
      updateAllFilteredCachedResults (err) ->
        if err then cb err else
          cb()

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

module.exports =
  getUnfilteredCachedResults: getUnfilteredCachedResults
  getFilteredCachedResults: getFilteredCachedResults
  updateAllCaches: updateAllCaches
