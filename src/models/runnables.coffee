async = require 'async'
configs = require '../configs'
projects = require './projects'
users = require './users'

Runnables =

  create: (userId, framework, cb) ->
    projects.create userId, framework, (err, project) ->
      if err then cb err else
        users.findUser _id: userId, (err, user) ->
          if err then cb { code: 500, msg: 'error looking up user' } else
            if not user then { code: 404, msg: 'user not found' } else
              runnableId = encodeId project._id
              user.vote runnableId, (err) ->
                if err then { code: 500, msg: 'error updating vote count' } else
                  project.containerState (err, state) ->
                    if err then cb err else
                      json_project = project.toJSON()
                      json_project.state = state
                      json_project._id = runnableId
                      cb null, json_project

  fork: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, parent) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        if not parent then cb { code: 404, msg: 'parent runnable not found' } else
          projects.fork userId, parent, (err, project) ->
            if err then cb err else
              users.findUser _id: userId, (err, user) ->
                if err then cb { code: 500, msg: 'error looking up user' } else
                  if not user then { code: 404, msg: 'user not found' } else
                    runnableId = encodeId project._id
                    user.vote runnableId, (err) ->
                      if err then { code: 500, msg: 'error updating vote count' } else
                        project.containerState (err, state) ->
                          if err then cb err else
                            json_project = project.toJSON()
                            json_project.state = state
                            json_project._id = runnableId
                            json_project.parent = encodeId json_project.parent
                            cb null, json_project

  delete: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    removeProject = () ->
      projects.destroy runnableId, (err) ->
        if err then cb err else cb()
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error querying mongodb' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() is userId.toString() then removeProject() else
            users.findUser _id: userId, (err, user) ->
              if err then cb { code: 500, msg: 'error looking up user' } else
                if not user then { code: 404, msg: 'user not found' } else
                  if user.permission_level <= 1 then cb { code: 403, msg: 'permission denied' } else
                    for vote in user.votes
                      if vote.runnable.toString() is project._id.toString()
                        console.log 'removing self vote'
                        vote.remove()
                    removeProject()

  isOwner: (userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          cb null, project.owner.toString() is userId.toString()

  get: (runnableId, fetchComments, cb) ->
    runnableId = decodeId runnableId
    if fetchComments
      projects.findOne(_id: runnableId).populate('comments.user', 'email username').exec (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
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
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
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
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
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
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          if project.owner.toString() isnt userId.toString() then cb { code: 403, msg: 'permission denied' } else
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
      if err then cb { code: 500, msg: 'error counting votes in mongodb' } else
        cb null, { count: count - 1 }

  listAll: (sortByVotes, cb) ->
    if not sortByVotes
      projects.find { }, (err, results) ->
        if err then cb { code: 500, msg: 'error querying mongodb' } else
          cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline, (err, results) ->
        if err then cb { code: 500, msg: 'error aggragating votes in mongodb' } else
          async.map results, (result, cb) ->
            projects.findOne _id: result._id, (err, runnable) ->
              if err then cb { code: 500, msg: 'error retrieving project from mongodb' } else
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

  listPublished: (sortByVotes, cb) ->
    if not sortByVotes
      projects.find tags: $not: $size: 0, (err, results) ->
        if err then cb { code: 500, msg: 'error querying mongodb' } else
          cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline, (err, results) ->
        if err then cb { code: 500, msg: 'error aggragating votes in mongodb' } else
          async.map results, (result, cb) ->
            projects.findOne { _id: result._id, tags: $not: $size: 0 }, (err, runnable) ->
              if err then cb { code: 500, msg: 'error retrieving project from mongodb' } else
                if runnable
                  runnable.votes = result.number - 1
                  cb null, runnable
                else cb()
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

  listChannel: (tag, sortByVotes, cb) ->
    if not sortByVotes
      projects.find 'tags.name': tag, (err, results) ->
        if err then cb { code: 500, msg: 'error querying mongodb' } else
          cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline, (err, results) ->
        if err then cb { code: 500, msg: 'error aggragating votes in mongodb' } else
          async.map results, (result, cb) ->
            projects.findOne { _id: result._id, 'tags.name': tag }, (err, runnable) ->
              if err then cb { code: 500, msg: 'error retrieving project from mongodb' } else
                if runnable
                  runnable.votes = result.number - 1
                  cb null, runnable
                else cb()
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

  listOwn: (userId, sortByVotes, cb) ->
    if not sortByVotes
      projects.find owner: userId, (err, results) ->
        if err then cb { code: 500, msg: 'error querying mongodb' } else
          cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline, (err, results) ->
        if err then cb { code: 500, msg: 'error aggragating votes in mongodb' } else
          async.map results, (result, cb) ->
            projects.findOne { _id: result._id, owner: userId }, (err, runnable) ->
              if err then cb { code: 500, msg: 'error retrieving project from mongodb' } else
                if runnable
                  runnable.votes = result.number - 1
                  cb null, runnable
                else cb()
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

voteSortPipeline = [
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
