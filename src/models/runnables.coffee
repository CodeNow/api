projects = require './projects'
users = require './users'

arrayToJSON = (res) ->
  result = (item.toJSON() for item in res)

commentsToJSON = (res) ->
  result = [ ]
  res.forEach (item) ->
    comment = item.user.toJSON()
    comment.text = item.text
    delete comment.email
    result.push comment
  result

Runnables =

  create: (userId, framework, cb) ->
    projects.create userId, framework, cb

  delete: (userId, runnableId, cb) ->

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
    if fetchComments
      projects.findOne(_id: runnableId).populate('comments.user', 'email username').exec (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            json_project = project.toJSON()
            json_project.comments = commentsToJSON project.comments
            cb null, json_project
    else
      projects.findOne _id: runnableId, (err, project) ->
        if err then cb { code: 500, msg: 'error looking up runnable' } else
          if not project then cb { code: 404, msg: 'runnable not found' } else
            cb null, project.toJSON()

  getComments: (runnableId, fetchUsers, cb) ->
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

  addComment: (userId, runnableId, text, cb) ->
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

module.exports = Runnables