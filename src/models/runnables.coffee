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

  getTags: (runnableId, cb) ->
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          cb null, project.tags

  getTag: (runnableId, tagId, cb) ->
    projects.findOne _id: runnableId, (err, project) ->
      if err then cb { code: 500, msg: 'error looking up runnable' } else
        if not project then cb { code: 404, msg: 'runnable not found' } else
          tag = project.tags.id tagId
          if not tag then cb { code: 404, msg: 'tag not found' } else
            cb null, tag

  addTag: (userId, runnableId, text, cb) ->
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

module.exports = Runnables