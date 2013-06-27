async = require 'async'
configs = require '../configs'
containers = require './containers'
error = require '../error'
images = require './images'
users = require './users'
projects = require './projects'

Runnables =

  createImage: (userId, from, cb) ->
    handler = (err, image) ->
      if err then cb err else
        users.findUser _id: userId, (err, user) ->
          if err then cb new error { code: 500, msg: 'error looking up user' } else
            if not user then cb new error { code: 404, msg: 'user not found' } else
              runnableId = encodeId image._id
              user.vote runnableId, (err) ->
                if err then cb new error { code: 500, msg: 'error updating vote count' } else
                  json_image = image.toJSON()
                  if json_image.parent then json_image.parent = encodeId json_image.parent
                  json_image._id = runnableId
                  cb null, json_image
    if from is 'node.js'
      images.createFromDisk userId, from, handler
    else
      from = decodeId from
      containers.findOne { _id: from }, (err, container) ->
        if err then cb err else
          if not container then cb new error { code: 400, msg: 'source runnable not found' } else
            images.create container, handler

  createContainer: (userId, from, cb) ->
    from = decodeId from
    images.findOne _id: from, (err, image) ->
      if err then cb err else
        if not image then cb new error { code: 400, msg: 'could not find source image to fork from' } else
          containers.findOne { owner: userId, parent: from }, (err, container) ->
            if err then cb new error { code: 500, msg: 'error querying for existing container' } else
              if container then cb new error ({ code: 403, msg: 'already editing a project from this parent' }) else
                containers.create userId, image, (err, container) ->
                  if err then cb err else
                    container.getProcessState (err, state) ->
                      if err then cb err else
                        json_container = container.toJSON()
                        if json_container.parent then json_container.parent = encodeId json_container.parent
                        json_container.state = state
                        json_container._id = encodeId container._id
                        cb null, json_container

  listContainers: (userId, parent, cb) ->
    query = { owner: userId }
    if parent then query.parent = decodeId parent
    containers.find query, (err, containers) ->
      if err then cb new error { code: 500, msg: 'error fetching containers from mongodb' } else
        results = for item in containers
          json = item.toJSON()
          json._id = encodeId json._id
          if json.parent then json.parent = encodeId json.parent
          json
        cb null, results

  removeContainer: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    remove = () ->
      containers.destroy runnableId, (err) ->
        if err then cb err else cb()
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error querying mongodb' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() is userId.toString() then remove() else
            users.findUser _id: userId, (err, user) ->
              if err then cb new error { code: 500, msg: 'error looking up user' } else
                if not user then cb new error { code: 404, msg: 'user not found' } else
                  if user.permission_level <= 1 then cb new error { code: 403, msg: 'permission denied' } else
                    remove()

  delete: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    removeProject = () ->
      projects.destroy runnableId, (err) ->
        if err then cb err else cb()
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error querying mongodb' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() is userId.toString() then removeProject() else
            users.findUser _id: userId, (err, user) ->
              if err then cb new error { code: 500, msg: 'error looking up user' } else
                if not user then cb new error { code: 404, msg: 'user not found' } else
                  if user.permission_level <= 1 then cb new error { code: 403, msg: 'permission denied' } else
                    for vote in user.votes
                      if vote.runnable.toString() is project._id.toString()
                        vote.remove()
                    removeProject()

  isOwner: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          cb null, project.owner.toString() is userId.toString()

  get: (runnableId, fetchComments, cb) ->
    runnableId = decodeId runnableId
    if fetchComments
      projects.findOne(_id: runnableId).populate('comments.user', 'email username').exec (err, project) ->
        if err then cb new error { code: 500, msg: 'error looking up runnable' } else
          if not project then cb new error { code: 404, msg: 'runnable not found' } else
            project.containerState (err, state) ->
              if err then cb err else
                json_project = project.toJSON()
                json_project.state = state
                json_project.comments = commentsToJSON project.comments
                json_project._id = encodeId json_project._id
                if json_project.parent then json_project.parent = encodeId json_project.parent
                cb null, json_project
    else
      projects.findOne _id: runnableId, (err, project) ->
        if err then cb new error { code: 500, msg: 'error looking up runnable' } else
          if not project then cb new error { code: 404, msg: 'runnable not found' } else
            project.containerState (err, state) ->
              if err then cb err else
                json_project = project.toJSON()
                json_project._id = encodeId json_project._id
                if json_project.parent then json_project.parent = encodeId json_project.parent
                json_project.state = state
                cb null, json_project

  start: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.start (err) ->
              if err then cb err else
                project.containerState (err, state) ->
                  if err then cb err else
                    json_project = project.toJSON()
                    json_project._id = encodeId json_project._id
                    if json_project.parent then json_project.parent = encodeId json_project.parent
                    json_project.state = state
                    cb null, json_project

  stop: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.stop (err) ->
              if err then cb err else
                project.containerState (err, state) ->
                  if err then cb err else
                    json_project = project.toJSON()
                    json_project._id = encodeId json_project._id
                    if json_project.parent then json_project.parent = encodeId json_project.parent
                    json_project.state = state
                    cb null, json_project

  getVotes: (runnableId, cb) ->
    runnableId = decodeId runnableId
    users.find('votes.runnable': runnableId).count().exec (err, count) ->
      if err then cb new error { code: 500, msg: 'error counting votes in mongodb' } else
        cb null, { count: count - 1 }

  listAll: (sortByVotes, limit, page, cb) ->
    if not sortByVotes
      projects.find().skip(page*limit).limit(limit).exec (err, results) ->
        if err then cb new error { code: 500, msg: 'error querying mongodb' } else
          cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline(limit, limit*page), (err, results) ->
        if err then cb new error { code: 500, msg: 'error aggragating votes in mongodb' } else
          async.map results, (result, cb) ->
            projects.findOne _id: result._id, (err, runnable) ->
              if err then cb new error { code: 500, msg: 'error retrieving project from mongodb' } else
                runnable.votes = result.number - 1
                cb null, runnable
          , (err, results) ->
            if err then cb err else
              result = for item in results
                json = item.toJSON()
                json._id = encodeId json._id
                json.votes = item.votes
                if json.parent then json.parent = encodeId json.parent
                json
              cb null, result

  listFiltered: (query, sortByVotes, limit, page, cb) ->
      if not sortByVotes
        projects.find(query).skip(page*limit).limit(limit).exec (err, results) ->
          if err then cb new error { code: 500, msg: 'error querying mongodb' } else
            cb null, arrayToJSON results
      else
        projects.find query, (err, selected) ->
          filter = [ ]
          for project in selected
            filter.push project._id
          users.aggregate voteSortPipelineFiltered(limit, limit*page, filter), (err, results) ->
            if err then cb new error { code: 500, msg: 'error aggragating votes in mongodb' } else
              async.map results, (result, cb) ->
                projects.findOne { _id: result._id }, (err, runnable) ->
                  if err then cb new error { code: 500, msg: 'error retrieving project from mongodb' } else
                    runnable.votes = result.number - 1
                    cb null, runnable
              , (err, results) ->
                if err then cb err else
                  result = for item in results
                    json = item.toJSON()
                    json._id = encodeId json._id
                    json.votes = item.votes
                    if json.parent then json.parent = encodeId json.parent
                    json
                  cb null, result

  getTags: (runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          cb null, project.tags

  getTag: (runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          tag = project.tags.id tagId
          if not tag then cb new error { code: 404, msg: 'tag not found' } else
            cb null, tag

  addTag: (userId, runnableId, text, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString()
            users.findUser _id: userId, (err, user) ->
              if err then cb new error { code: 500, 'error looking up user' } else
                if not user then cb new error { code: 500, 'user not found' } else
                  if user.permission_level < 2 then cb new error { code: 403, msg: 'permission denied' } else
                    project.tags.push name: text
                    tagId = project.tags[project.tags.length-1]._id
                    project.save (err) ->
                      if err then cb new error { code: 500, msg: 'error saving tag' } else
                        cb null, { name: text, _id: tagId }
          else
            project.tags.push name: text
            tagId = project.tags[project.tags.length-1]._id
            project.save (err) ->
              if err then cb new error { code: 500, msg: 'error saving tag' } else
                cb null, { name: text, _id: tagId }

  removeTag: (userId, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString()
            user = users.findOne _id: userId, (err, user) ->
              if err then cb new error { code: 500, msg: 'error looking up user' } else
                if not user then cb new error { code: 500, msg: 'user not found' } else
                  if user.permission_level < 2 then cb new error { code: 403, msg: 'permission denied' } else
                    project.tags.id(tagId).remove()
                    project.save (err) ->
                      if err then cb new error { code: 500, msg: 'error removing tag from mongodb' } else cb()
          else
            project.tags.id(tagId).remove()
            project.save (err) ->
              if err then cb new error { code: 500, msg: 'error removing tag from mongodb' } else cb()

  listFiles: (runnableId, content, dir, default_tag, path, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          container.listFiles content, dir, default_tag, path, cb

  createFile: (userId, runnableId, name, path, content, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.createFile name, path, content, cb

  updateFile: (userId, runnableId, fileId, content, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.updateFile fileId, content, cb

  defaultFile: (userId, runnableId, fileId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.tagFile fileId, cb

  renameFile: (userId, runnableId, fileId, name, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.renameFile fileId, name, cb

  moveFile: (userId, runnableId, fileId, path, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.moveFile fileId, path, cb

  createDirectory: (userId, runnableId, name, path, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            project.createDirectory name, path, cb

  readFile: (runnableId, fileId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          file = project.files.id fileId
          if not file then cb new error { code: 404, msg: 'file not found' } else
            project.readFile fileId, cb

  deleteFile: (runnableId, fileId, recursive, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          file = project.files.id fileId
          if not file then cb new error { code: 404, msg: 'file not found' } else
            project.deleteFile fileId, recursive, cb

  deleteAllFiles: (runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not project then cb new error { code: 404, msg: 'runnable not found' } else
          project.deleteAllFiles cb


module.exports = Runnables

voteSortPipeline = (limit, skip) ->
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
      $skip: skip
    },
    {
      $limit: limit
    }
  ]

voteSortPipelineFiltered = (limit, skip, filter) ->
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
      $skip: skip
    },
    {
      $limit: limit
    }
  ]

arrayToJSON = (res) ->
  result = for item in res
    json = item.toJSON()
    json._id = encodeId json._id
    if json.parent then json.parent = encodeId json.parent
    json

commentsToJSON = (res) ->
  result = [ ]
  res.forEach (item) ->
    comment = item.user.toJSON()
    comment.text = item.text
    delete comment.email
    result.push comment
  result

plus = /\+/g
slash = /\//g
minus = /-/g
underscore = /_/g

encodeId = (id) -> id
decodeId = (id) -> id

if configs.shortProjectIds
  encodeId = (id) -> (new Buffer(id.toString(), 'hex')).toString('base64').replace(plus,'-').replace(slash,'_')
  decodeId = (id) -> (new Buffer(id.toString().replace(minus,'+').replace(underscore,'/'), 'base64')).toString('hex');
