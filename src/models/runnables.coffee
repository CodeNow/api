configs = require '../configs'
dockerjs = require 'docker.js'
projects = require './projects'
redis = require 'redis'
users = require './users'
volumes = require './volumes'

docker = dockerjs host: configs.docker
red = redis.createClient()

Runnables =

  create: (userId, framework, cb) ->
    projects.create userId, framework, (err, project) ->
      if err then cb err else
        json_project = project.toJSON()
        json_project.running = false
        json_project._id = encodeId json_project._id
        cb null, json_project

  delete: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    removeProject = () ->
      projects.remove _id: runnableId, (err) ->
        if err then cb { code: 500, msg: 'error deleting runnable from database' } else
          cb()
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() is userId.toString() then removeProject() else
            users.findUser _id: userId, (err, user) ->
              if err then cb { code: 500, msg: 'error looking up user' } else
                if not user then { code: 404, msg: 'user not found' } else
                  if user.permission_level <= 1 then cb { code: 403, msg: 'permission denied' } else
                    removeProject()

  get: (runnableId, fetchComments, cb) ->
    runnableId = decodeId runnableId
    if fetchComments
      projects.findOne(_id: runnableId).populate('comments.user', 'email username').exec (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            json_project = project.toJSON()
            json_project.comments = commentsToJSON project.comments
            json_project._id = encodeId json_project._id
            cb null, json_project
    else
      projects.findOne _id: runnableId, (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            json_project = project.toJSON()
            json_project._id = encodeId json_project._id
            red.get project._id, (err, container) ->
              if err then cb { code: 500, msg: 'error fetching from redis store' } else
                if not container
                  json_project.running = false
                  cb null, json_project
                else
                  docker.inspectContainer container, (err, result) ->
                    if err then cb { code: 500, msg: 'error fetching container status' } else
                      json_project.running = result.State.Running
                      cb null, json_project


  start: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            red.get project._id, (err, container) ->
              if err then cb { code: 500, msg: 'error fetching from redis store' } else
                if not container
                  docker.createContainer
                    Hostname: project._id.toString()
                    Image: 'base'
                    Cmd: [
                      '/bin/bash'
                    ]
                  , (err, result) ->
                    if err then cb { code: 500, msg: 'error creating docker container' } else
                      red.set project._id, result.Id
                      docker.startContainer result.Id, (err, result) ->
                        if err then cb { code: 500, msg: 'error starting docker container' } else
                          project_json = project.toJSON()
                          project_json._id = encodeId project_json._id
                          project_json.running = true
                          cb null, project_json
                else
                  docker.startContainer container, (err, result) ->
                    if err then cb { code: 500, msg: 'error starting docker container' } else
                      cb()

  stop: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            red.get project._id, (err, container) ->
              if err then cb { code: 500, msg: 'error fetching from redis store' } else
                if not container then cb { code: 403, msg: 'runnable is already stopped' } else
                  docker.stopContainer container, (err, result) ->
                    if err then cb { code: 500, msg: 'error stopping docker container' } else
                      project_json = project.toJSON()
                      project_json._id = encodeId project_json._id
                      project_json.running = false
                      cb null, project_json

  listPublished: (cb) ->
    projects.find tags: $not: $size: 0, (err, results) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        cb null, arrayToJSON results

  listChannel: (tag, cb) ->
    projects.find tags: tag, (err, results) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        cb null, arrayToJSON results

  listOwn: (userId, cb) ->
    projects.find owner: userId, (err, results) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        cb null, arrayToJSON results

  getComments: (runnableId, fetchUsers, cb) ->
    runnableId = decodeId runnableId
    if fetchUsers
      projects.findOne(_id: runnableId).populate('comments.user', 'email username').exec (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            cb null, commentsToJSON project.comments
    else
      projects.findOne _id: runnableId, (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            cb null, project.comments

  getComment: (runnableId, fetchUser, commentId, cb) ->
    runnableId = decodeId runnableId
    if fetchUser
      projects.findOne(_id: runnableId).populate('comments.user', 'email username').exec (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            comment = project.comments.id commentId
            if not comment then cb { code: 404, msg: 'comment not found' } else
              json_comment = comment.user.toJSON()
              json_comment.text = comment.text
              delete json_comment.email
              cb null, json_comment
    else
      projects.findOne _id: runnableId, (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            comment = project.comments.id commentId
            if not comment then cb { code: 404, msg: 'comment not found' } else
              cb null, comment

  addComment: (userId, runnableId, text, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          project.comments.push
            user: userId
            text: text
          commentId = project.comments[project.comments.length-1]._id
          project.save (err) ->
            if err then cb { code: 500, msg: 'error saving comment' } else
              cb null, { user: userId, text: text, _id: commentId }

  removeComment: (userId, runnableId, commentId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          remove = () ->
            project.comments.id(commentId).remove()
            project.save (err) ->
              if err then cb { code: 500, msg: 'error removing comment from mongodb' } else
                cb()
          if project.comments.id(commentId).user.toString() is userId.toString() then remove() else
            users.findUser _id: userId, (err, user) ->
              if err then cb err else
                if user.permission_level > 1 then remove() else
                  cb { code: 403, msg: 'permission denied' }

  getTags: (runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          cb null, project.tags

  getTag: (runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          tag = project.tags.id tagId
          if not tag then cb { code: 404, msg: 'tag not found' } else
            cb null, tag

  addTag: (userId, runnableId, text, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString()
            users.findUser _id: userId, (err, user) ->
              if err then cb { code: 500, 'error looking up user' } else
                if not user then cb { code: 500, 'user not found' } else
                  if user.permission_level < 2 then cb { code: 403, msg: 'permission denied' } else
                    project.tags.push name: text
                    tagId = project.tags[project.tags.length-1]._id
                    project.save (err) ->
                      if err then cb { code: 500, msg: 'error saving tag' } else
                        cb null, { name: text, _id: tagId }
          else
            project.tags.push name: text
            tagId = project.tags[project.tags.length-1]._id
            project.save (err) ->
              if err then cb { code: 500, msg: 'error saving tag' } else
                cb null, { name: text, _id: tagId }

  removeTag: (userId, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString()
            user = users.findOne _id: userId, (err, user) ->
              if err then cb { code: 500, msg: 'error looking up user' } else
                if not user then cb { code: 500, msg: 'user not found' } else
                  if user.permission_level < 2 then cb { code: 403, msg: 'permission denied' } else
                    project.tags.id(tagId).remove()
                    project.save (err) ->
                      if err then cb { code: 500, msg: 'error removing tag from mongodb' } else cb()
          else
            project.tags.id(tagId).remove()
            project.save (err) ->
              if err then cb { code: 500, msg: 'error removing tag from mongodb' } else cb()

  listFiles: (runnableId, content, dir, default_tag, path, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          project.listFiles content, dir, default_tag, path, cb

  createFile: (userId, runnableId, name, path, content, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            project.createFile name, path, content, cb

  updateFile: (userId, runnableId, fileId, content, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            project.updateFile fileId, content, cb

  defaultFile: (userId, runnableId, fileId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            project.tagFile fileId, cb

  renameFile: (userId, runnableId, fileId, name, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            project.renameFile fileId, name, cb

  moveFile: (userId, runnableId, fileId, path, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            project.moveFile fileId, path, cb

  createDirectory: (userId, runnableId, name, path, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
            project.createDirectory name, path, cb

  readFile: (runnableId, fileId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          file = project.files.id fileId
          if not file then cb { code: 404, msg: 'file not found' } else
            project.readFile fileId, cb

  deleteFile: (runnableId, fileId, recursive, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          file = project.files.id fileId
          if not file then cb { code: 404, msg: 'file not found' } else
            project.deleteFile fileId, recursive, cb

  deleteAllFiles: (runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          project.deleteAllFiles cb


module.exports = Runnables

arrayToJSON = (res) ->
  result = for item in res
    json = item.toJSON()
    json._id = encodeId json._id
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
