async = require 'async'
configs = require '../configs'
containers = require './containers'
error = require '../error'
images = require './images'
users = require './users'

Runnables =

  createImage: (userId, from, cb) ->
    handler = (err, image) ->
      if err then cb err else
        users.findUser _id: userId, (err, user) ->
          if err then cb new error { code: 500, msg: 'error looking up user' } else
            if not user then cb new error { code: 404, msg: 'user not found' } else
              user.addVote image._id, (err) ->
                if err then cb err else
                  json_image = image.toJSON()
                  if json_image.parent then json_image.parent = encodeId json_image.parent
                  json_image._id = encodeId image._id
                  cb null, json_image
    if from is 'node.js'
      images.createFromDisk userId, from, handler
    else
      from = decodeId from
      containers.findOne { _id: from }, (err, container) ->
        if err then cb new error { code: 500, msg: 'error fetching container from mongodb'} else
          if not container then cb new error { code: 403, msg: 'source runnable not found' } else
            images.create container, (err, image) ->
              if err then cb err else
                container.target = image._id
                container.save (err) ->
                  if err then cb new error { code: 500, msg: 'error updating save target for container' } else
                    handler null, image

  createContainer: (userId, from, cb) ->
    from = decodeId from
    images.findOne _id: from, (err, image) ->
      if err then cb err else
        if not image then cb new error { code: 400, msg: 'could not find source image to fork from' } else
          containers.create userId, image, (err, container) ->
            if err then cb err else
              container.getProcessState (err, state) ->
                if err then cb err else
                  json_container = container.toJSON()
                  if json_container.parent then json_container.parent = encodeId json_container.parent
                  if json_container.target then json_container.target = encodeId json_container.target
                  json_container.state = state
                  json_container._id = encodeId container._id
                  cb null, json_container

  touchContainer: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            containers.touch runnableId, cb

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

  getContainer: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.getProcessState (err, state) ->
              if err then cb err else
                json = container.toJSON()
                json._id = encodeId json._id
                if json.parent then json.parent = encodeId json.parent
                if json.target then json.target = encodeId json.target
                json.state = state
                cb null, json

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

  removeImage: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    remove = () ->
      images.destroy runnableId, (err) ->
        if err then cb err else cb()
    images.findOne _id: runnableId, (err, image) ->
      if err then cb new error { code: 500, msg: 'error querying mongodb' } else
        if not image then cb new error { code: 404, msg: 'runnable not found' } else
          if image.owner.toString() is userId.toString() then remove() else
            users.findUser _id: userId, (err, user) ->
              if err then cb new error { code: 500, msg: 'error looking up user' } else
                if not user then cb new error { code: 404, msg: 'user not found' } else
                  if user.permission_level <= 1 then cb new error { code: 403, msg: 'permission denied' } else
                    for vote in user.votes
                      if vote.runnable.toString() is image._id.toString()
                        vote.remove()
                    remove()

  updateName: (userId, runnableId, newName, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.name = newName;
            container.save (err) ->
              if err then cb new error { code: 500, msg: 'error saving runnable to mongodb'} else
                cb()

  updateImage: (userId, runnableId, from, cb) ->
    runnableId = decodeId runnableId
    from = decodeId from
    images.findOne _id: runnableId, (err, image) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable in mongodb' } else
        if not image then cb new error { code: 404, msg: 'Published runnable does not exist' } else
          containers.findOne _id: from, (err, container) ->
            if err then cb new error { code: 500, msg: 'Error looking up container to save from in mongodb' } else
              if not container then cb new error { code: 403, msg: 'source container to copy from does not exist' } else
                image.updateFromContainer container, (err, image) ->
                  if err then cb err else
                    cb null, image

  getImage: (runnableId, cb) ->
    decodedRunnableId = decodeId runnableId
    images.findOne _id: decodedRunnableId, (err, image) =>
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not image then cb new error { code: 404, msg: 'runnable not found' } else
          @getVotes runnableId, (err, votes) ->
            if err then cb err else
              json_project = image.toJSON()
              json_project.votes = votes.count
              json_project._id = encodeId json_project._id
              if json_project.parent then json_project.parent = encodeId json_project.parent
              cb null, json_project

  startContainer: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.getProcessState (err, state) ->
              if err then cb err else
                response = (state) ->
                  json_project = container.toJSON()
                  json_project._id = encodeId json_project._id
                  if json_project.parent then json_project.parent = encodeId json_project.parent
                  json_project.state = state
                  cb null, json_project
                if state.running then response state else
                  container.start (err) ->
                    if err then cb err else
                      container.getProcessState (err, state) ->
                        if err then cb err else
                          response state

  stopContainer: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.getProcessState (err, state) ->
              if err then cb err else
                response = (state) ->
                  json_project = container.toJSON()
                  json_project._id = encodeId json_project._id
                  if json_project.parent then json_project.parent = encodeId json_project.parent
                  json_project.state = state
                  cb null, json_project
                if not state.running then response state else
                  container.stop (err) ->
                    if err then cb err else
                      container.getProcessState (err, state) ->
                        if err then cb err else
                          response state

  getVotes: (runnableId, cb) ->
    runnableId = decodeId runnableId
    users.find('votes.runnable': runnableId).count().exec (err, count) ->
      if err then cb new error { code: 500, msg: 'error counting votes in mongodb' } else
        cb null, { count: count - 1 }

  vote: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    images.isOwner userId, runnableId, (err, owner) ->
      if err then cb err else
        if owner then cb new error { code: 403, msg: 'cannot vote for own runnables' } else
          users.findOne _id: userId, (err, user) ->
            if err then cb new error { code: 500, msg: 'error looking up user in mongodb' } else
              if not user then cb new error { code: 403, msg: 'user not found' } else
                user.addVote runnableId, cb

  listAll: (sortByVotes, limit, page, cb) ->
    if not sortByVotes
      images.find().skip(page*limit).limit(limit).exec (err, results) ->
        if err then cb new error { code: 500, msg: 'error querying mongodb' } else
          cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline(limit, limit*page), (err, results) ->
        if err then cb new error { code: 500, msg: 'error aggragating votes in mongodb' } else
          async.map results, (result, cb) ->
            images.findOne _id: result._id, (err, runnable) ->
              if err then cb new error { code: 500, msg: 'error retrieving image from mongodb' } else
                if not runnable then cb() else
                  runnable.votes = result.number - 1
                  cb null, runnable
          , (err, results) ->
            if err then cb err else
              result = [ ]
              for item in results
                if item
                  json = item.toJSON()
                  json._id = encodeId json._id
                  json.votes = item.votes
                  if json.parent then json.parent = encodeId json.parent
                  result.push json
              cb null, result

  listFiltered: (query, sortByVotes, limit, page, cb) ->
      if not sortByVotes
        images.find(query).skip(page*limit).limit(limit).exec (err, results) ->
          if err then cb new error { code: 500, msg: 'error querying mongodb' } else
            cb null, arrayToJSON results
      else
        images.find query, (err, selected) ->
          filter = [ ]
          for image in selected
            filter.push image._id
          users.aggregate voteSortPipelineFiltered(limit, limit*page, filter), (err, results) ->
            if err then cb new error { code: 500, msg: 'error aggragating votes in mongodb' } else
              async.map results, (result, cb) ->
                images.findOne { _id: result._id }, (err, runnable) ->
                  if err then cb new error { code: 500, msg: 'error retrieving image from mongodb' } else
                    if not runnable then cb() else
                      runnable.votes = result.number - 1
                      cb null, runnable
              , (err, results) ->
                if err then cb err else
                  result = [ ]
                  for item in results
                    if item
                      json = item.toJSON()
                      json._id = encodeId json._id
                      json.votes = item.votes
                      if json.parent then json.parent = encodeId json.parent
                      result.push json
                  cb null, result

  getTags: (runnableId, cb) ->
    runnableId = decodeId runnableId
    images.findOne _id: runnableId, (err, image) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not image then cb new error { code: 404, msg: 'runnable not found' } else
          cb null, image.tags

  getTag: (runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    images.findOne _id: runnableId, (err, image) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not image then cb new error { code: 404, msg: 'runnable not found' } else
          tag = image.tags.id tagId
          if not tag then cb new error { code: 404, msg: 'tag not found' } else
            cb null, tag

  addTag: (userId, runnableId, text, cb) ->
    users.findUser _id: userId, (err, user) ->
      if err then cb new error { code: 500, msg: 'error looking up user' } else
        if not user then cb new error { code: 403, msg: 'user not found' } else
          if user.permission_level < 1 then cb new error { code: 403, msg: 'permission denied' } else
            runnableId = decodeId runnableId
            images.findOne _id: runnableId, (err, image) ->
              if err then cb new error { code: 500, msg: 'error looking up runnable' } else
                if not image then cb new error { code: 404, msg: 'runnable not found' } else
                  if image.owner.toString() isnt userId.toString()
                    if user.permission_level < 2 then cb new error { code: 403, msg: 'permission denied' } else
                      image.tags.push name: text
                      tagId = image.tags[image.tags.length-1]._id
                      image.save (err) ->
                        if err then cb new error { code: 500, msg: 'error saving tag' } else
                          cb null, { name: text, _id: tagId }
                  else
                    image.tags.push name: text
                    tagId = image.tags[image.tags.length-1]._id
                    image.save (err) ->
                      if err then cb new error { code: 500, msg: 'error saving tag' } else
                        cb null, { name: text, _id: tagId }

  removeTag: (userId, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    images.findOne _id: runnableId, (err, image) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not image then cb new error { code: 404, msg: 'runnable not found' } else
          if image.owner.toString() isnt userId.toString()
            user = users.findOne _id: userId, (err, user) ->
              if err then cb new error { code: 500, msg: 'error looking up user' } else
                if not user then cb new error { code: 500, msg: 'user not found' } else
                  if user.permission_level < 2 then cb new error { code: 403, msg: 'permission denied' } else
                    image.tags.id(tagId).remove()
                    image.save (err) ->
                      if err then cb new error { code: 500, msg: 'error removing tag from mongodb' } else cb()
          else
            image.tags.id(tagId).remove()
            image.save (err) ->
              if err then cb new error { code: 500, msg: 'error removing tag from mongodb' } else cb()

  listFiles: (runnableId, content, dir, default_tag, path, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          container.listFiles content, dir, default_tag, path, cb

  # Praful: Both these methods are shimmmed to always get a running container
  # this logic needs to be replaced to get the projects
  # right container to interact with these files
  readDir: (runnableId, path, cb) ->
    runnableId = decodeId runnableId
    containers.findOne (err, container) ->
    # containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          container.readDir path, cb

  changeFile: (runnableId, path, content, cb) ->
    runnableId = decodeId runnableId
    containers.findOne (err, container) ->
    # containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          container.changeFile path, content, cb

  createFile: (userId, runnableId, name, path, content, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.createFile name, path, content, cb

  updateFile: (userId, runnableId, fileId, content, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.updateFile fileId, content, cb

  defaultFile: (userId, runnableId, fileId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.tagFile fileId, cb

  renameFile: (userId, runnableId, fileId, name, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.renameFile fileId, name, cb

  moveFile: (userId, runnableId, fileId, path, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.moveFile fileId, path, cb

  createDirectory: (userId, runnableId, name, path, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          if container.owner.toString() isnt userId.toString() then cb new error { code: 403, msg: 'permission denied' } else
            container.createDirectory name, path, cb

  readFile: (runnableId, fileId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          file = container.files.id fileId
          if not file then cb new error { code: 404, msg: 'file not found' } else
            container.readFile fileId, cb

  deleteFile: (runnableId, fileId, recursive, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          file = container.files.id fileId
          if not file then cb new error { code: 404, msg: 'file not found' } else
            container.deleteFile fileId, recursive, cb

  deleteAllFiles: (runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, (err, container) ->
      if err then cb new error { code: 500, msg: 'error looking up runnable' } else
        if not container then cb new error { code: 404, msg: 'runnable not found' } else
          container.deleteAllFiles cb


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
