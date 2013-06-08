projects = require './projects'

Runnables =

  create: (userId, framework, cb) ->
    projects.create userId, framework, cb

  listPublished: (cb) ->
    projects.find tags: $not: $size: 0, (err, results) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        cb null, results

  listChannel: (tag, cb) ->
    projects.find tags: tag, (err, results) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        cb null, results

  listOwn: (userId, cb) ->
    projects.find().where('owner').equals(userId).exec (err, results) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        cb null, results

  listChannels: (cb) ->
    projects.listTags cb

module.exports = Runnables