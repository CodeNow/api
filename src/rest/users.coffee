async = require 'async'
configs = require '../configs'
debug = require('debug')('users')
domains = require '../domains'
error = require '../error'
express = require 'express'
fs = require 'fs'
formidable = require 'formidable'
users = require '../models/users'
redis = require 'redis'
runnables = require '../models/runnables'
uuid = require 'node-uuid'
_ = require 'lodash'
url = require 'url'

redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress)

module.exports = (parentDomain) ->

  app = module.exports = express()

  app.use domains parentDomain

  fetchuser = (req, res, next) ->
    if not req.params.userid.match /^[0-9a-fA-F]{24}$/ then res.json 404, message: 'user not found' else
      users.findUser req.domain, _id: req.params.userid, (err, user) ->
        if err then res.json err.code, message: err.msg else
          if not user then res.json 404, message: 'user not found' else
            if req.params.userid.toString() isnt req.user_id.toString() then res.json 403, message: 'permission denied' else
              next()

  app.post '/users', (req, res) ->
    users.createUser req.domain, (err, user) ->
      if err then res.json err.code, message: err.msg else
        access_token = uuid.v4()
        redis_client.psetex [ access_token, configs.tokenExpires, user._id ], (err) ->
          if err then throw err
          json_user = user.toJSON()
          json_user.access_token = access_token
          if not req.body.email? then res.json 201, json_user else
            if not req.body.username? then res.json 400, message: 'must provide a username to register with' else
              if not req.body.password? then res.json 400, message: 'must provide a password to register with' else
                data = _.pick req.body, 'email', 'username', 'password'
                users.registerUser req.domain, user._id, data, (err, user) ->
                  if err then res.json err.code, message: err.msg else
                    json_user = user.toJSON()
                    delete json_user.password
                    json_user.access_token = access_token
                    res.json 201, json_user

  app.post '/token', (req, res) ->
    if not req.body.username? and not req.body.email? then res.json 400, message: 'username or email required' else
      if not req.body.password? then res.json 400, message: 'password required' else
        identity = req.body.email or req.body.username
        users.loginUser req.domain, identity, req.body.password, (err, user_id) ->
          if err then res.json err.code, message: err.msg
          access_token = uuid.v4()
          redis_client.psetex [ access_token, configs.tokenExpires, user_id ], (err) ->
            if err then throw err
            res.json access_token: access_token

  app.all '*', (req, res, next) ->
    if (/\/runnables\?map=true|\/channels\?map=true/.test(url.parse(req.url).path))
      return next()
    token = req.get('runnable-token');
    if not token then res.json 401, message: 'access token required' else
      redis_client.get token, (err, user_id) ->
        if err then throw err
        if not user_id then res.json 401, message: 'must provide a valid access token' else
          req.user_id = user_id
          next()

  getusers = (req, res) ->
    userIds = req.query.ids or [ ]
    if !Array.isArray(userIds) then userIds = [ userIds ]
    if userIds.length is 0 then res.json 400, message: 'must provide ids for user to get' else
      users.publicListWithIds req.domain, userIds, (err, users) ->
        if err then cb err else
          res.json users

  app.get '/users', getusers

  getuser = (req, res) ->
    users.findUser req.domain, _id: req.user_id, (err, user) ->
      if err then res.json err.code, message: err.msg else
        if not user then res.json 404, message: 'user doesnt exist' else
          json_user = user.toJSON()
          delete json_user.password
          delete json_user.votes
          res.json json_user

  app.get '/users/me', getuser
  app.get '/users/:userid', fetchuser, getuser

  deluser = (req, res) ->
    users.removeUser req.domain, req.user_id, () ->
      res.json { message: 'user deleted' }

  app.del '/users/me', deluser
  app.del '/users/:userid', fetchuser, deluser

  putuser = (req, res) ->
    users.findUser req.domain, _id: req.user_id, (err, user) ->
      if err then res.json err.code, message: err.message else
        if user.permission_level isnt 0 then res.json 403, message: 'you are already registered' else
          if not req.body.email? then res.json 400, message: 'must provide an email to register with' else
            if not req.body.username? then res.json 400, message: 'must provide a username to register with' else
              if not req.body.password? then res.json 400, message: 'must provide a password to register with' else
                data = _.pick req.body, 'email', 'username', 'password'
                users.registerUser req.domain, req.user_id, data, (err, user) ->
                  if err then res.json err.code, message: err.msg else
                    res.json user

  app.put '/users/me', putuser
  app.put '/users/:userid', fetchuser, putuser

  getvotes = (req, res) ->
    users.findUser req.domain, { _id: req.user_id }, (err, user) ->
      if err then res.json err.code, message: err.msg else
        res.json user.getVotes()

  app.get '/users/me/votes', getvotes
  app.get '/users/:userid/votes', fetchuser, getvotes

  postvote = (req, res) ->
    if not req.body.runnable? then res.json 400, message: 'must include runnable to vote on' else
      runnables.vote req.domain, req.user_id, req.body.runnable, (err, vote) ->
        if err then res.json err.code, message: err.msg else
          res.json 201, vote

  app.post '/users/me/votes', postvote
  app.post '/users/:userid/votes', fetchuser, postvote

  removevote = (req, res) ->
    users.findUser req.domain, { _id: req.user_id }, (err, user) ->
      user.removeVote req.domain, req.params.voteid, (err) ->
        if err then res.json err.code, message: err.msg else
          res.json { message: 'removed vote' }

  app.del '/users/me/votes/:voteid', removevote
  app.del '/users/:userid/votes/:voteid', fetchuser, removevote

  postrunnable = (req, res) ->
    if not req.query.from? then res.json 400, message: 'must provide a runnable to fork from' else
      runnables.createContainer req.domain, req.user_id, req.query.from, (err, container) ->
        if err then res.json err.code, message: err.msg else
          res.json 201, container

  app.post '/users/me/runnables', postrunnable
  app.post '/users/:userid/runnables', fetchuser, postrunnable

  getrunnables = (req, res) ->
    parent = req.query.parent
    runnables.listContainers req.domain, req.user_id, parent, (err, containers) ->
      if err then res.json err.code, message: err.msg else
        res.json containers

  app.get '/users/me/runnables', getrunnables
  app.get '/users/:userid/runnables', fetchuser, getrunnables

  getrunnable = (req, res) ->
    runnables.getContainer req.domain, req.user_id, req.params.runnableid, (err, container) ->
      if err then res.json err.code, message: err.msg else
        res.json container

  app.get '/users/me/runnables/:runnableid', getrunnable
  app.get '/users/:userid/runnables/:runnableid', fetchuser, getrunnable

  putrunnable = (req, res) ->
    if not req.body.running? then res.json 400, message: 'must provide a running parameter' else
      attribs = ['name', 'description']
      set = {}
      attribs.every (attr) ->
        if not req.body[attr]? then res.json 400, message: 'must provide a runnable ' + attr else
          set[attr] = req.body[attr]
          return true
      runnables.updateContainer req.domain, req.user_id, req.params.runnableid, set, (err, runnable) ->
        if err then res.json err.code, message: err.msg else
          if req.body.running
            runnables.startContainer req.domain, req.user_id, req.params.runnableid, (err, runnable) ->
              res.json runnable
          else
            runnables.stopContainer req.domain, req.user_id, req.params.runnableid, (err, runnable) ->
              res.json runnable

  app.put '/users/me/runnables/:runnableid', putrunnable
  app.put '/users/:userid/runnables/:runnableid', fetchuser, putrunnable

  delrunnable = (req, res) ->
    runnables.removeContainer req.domain, req.user_id, req.params.runnableid, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message : 'runnable deleted' }

  app.del '/users/me/runnables/:runnableid', delrunnable
  app.del '/users/:userid/runnables/:runnableid', fetchuser, delrunnable

  gettags = (req, res) ->
    runnables.getContainerTags req.domain, req.params.id, (err, tags) ->
      if err then res.json err.code, message: err.msg else
        res.json tags

  app.get '/users/me/runnables/:id/tags', gettags
  app.get '/users/:userid/runnables/:id/tags', fetchuser, gettags

  posttag = (req, res) ->
    if not req.body.name? then res.json 400, message: 'tag must include a name field' else
      runnables.addContainerTag req.domain, req.user_id, req.params.id, req.body.name, (err, tag) ->
        if err then res.json err.code, message: err.msg else
          res.json 201, tag

  app.post '/users/me/runnables/:id/tags', posttag
  app.post '/users/:userid/runnables/:id/tags', fetchuser, posttag

  gettag = (req, res) ->
    runnables.getContainerTag req.domain, req.params.id, req.params.tagId, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json tag

  app.get '/users/me/runnables/:id/tags/:tagId', gettag
  app.get '/users/:userid/runnables/:id/tags/:tagId', fetchuser, gettag

  deltag = (req, res) ->
    runnables.removeContainerTag req.domain, req.user_id, req.params.id, req.params.tagId, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'tag deleted' }

  app.del '/users/me/runnables/:id/tags/:tagId', deltag
  app.del '/users/:userid/runnables/:id/tags/:tagId', fetchuser, deltag

  listfiles = (req, res) ->
    content = req.query.content?
    dir = req.query.dir?
    default_tag = req.query.default?
    path = req.query.path
    runnables.listFiles req.domain, req.user_id, req.params.runnableid, content, dir, default_tag, path, (err, files) ->
      if err then res.json err.code, message: err.msg else
        res.json files

  app.get '/users/me/runnables/:runnableid/files', listfiles
  app.get '/users/:userid/runnables/:runnableid/files', fetchuser, listfiles

  syncfiles = (req, res) ->
    runnables.syncFiles req.domain, req.user_id, req.params.id, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, { message: 'files synced successfully', date: new Date }

  app.post '/users/me/runnables/:id/sync', syncfiles
  app.post '/users/:userid/runnables/:id/sync', fetchuser, syncfiles

  createfile = (req, res) ->
    contentType = req.headers['content-type']
    if contentType is 'application/json'
      if req.body.dir
        if not req.body.name? then res.json 400, message: 'dir must include a name field' else
          if not req.body.path? then res.json 400, message: 'dir must include a path field'  else
            runnables.createDirectory req.domain, req.user_id, req.params.id, req.body.name, req.body.path, (err, dir) ->
              if err then res.json err.code, message: err.msg else
                res.json 201, dir
      else
        if not req.body.name? then res.json 400, message: 'file must include a name field' else
          if not req.body.content? then res.json 400, message: 'file must include a content field' else
            if not req.body.path? then res.json 400, message: 'file must include a path field' else
              runnables.createFile req.domain, req.user_id, req.params.id, req.body.name, req.body.path, req.body.content, (err, file) ->
                if err then res.json err.code, message: err.msg else
                  res.json 201, file
    else
      if /multipart\/form-data/.test(contentType)
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
          files_array = [ ]
          for key, file of files
            files_array.push file
          async.mapSeries files_array, (file, cb) ->
            filestream = fs.createReadStream file.path
            runnables.createFile req.domain, req.user_id, req.params.id, file.name, '/', filestream, cb
          , (err, files) ->
            if err then res.json err.code, message: err.msg else
              res.json 201, files
      else
        res.json 400, message: 'content type must be application/json or multipart/form-data'

  app.post '/users/me/runnables/:id/files', createfile
  app.post '/users/:userid/runnables/:id/files', fetchuser, createfile

  streamupdate = (req, res) ->
    contentType = req.headers['content-type']
    if /multipart\/form-data/.test(contentType)
      form = new formidable.IncomingForm()
      form.parse req, (err, fields, files) ->
        files_array = [ ]
        for key, file of files
          files_array.push file
        async.mapSeries files_array, (file, cb) ->
          filestream = fs.createReadStream file.path
          runnables.updateFileContents req.domain, req.user_id, req.params.id, "/#{file.name}", filestream, cb
        , (err, files) ->
          if err then res.json err.code, message: err.msg else
            res.json 200, files
    else
      res.json 400, message: 'content type must be application/json or multipart/form-data'

  app.put '/users/me/runnables/:id/files', streamupdate
  app.put '/users/:userid/runnables/:id/files', fetchuser, streamupdate

  createindir = (req, res) ->
    contentType = req.headers['content-type']
    if /multipart\/form-data/.test(contentType)
      form = new formidable.IncomingForm()
      form.parse req, (err, fields, files) ->
        files_array = [ ]
        for key, file of files
          files_array.push file
        runnables.readFile req.domain, req.user_id, req.params.id, req.params.fileid, (err, root) ->
          if err then res.json err.code, message: err.msg else
            if not root.dir then res.json 403, message: 'resource is not of directory type' else
              async.mapSeries files_array, (file, cb) ->
                filestream = fs.createReadStream file.path
                runnables.createFile req.domain, req.user_id, req.params.id, file.name, "#{root.path}/#{root.name}", filestream, cb
              , (err, files) ->
                if err then res.json err.code, message: err.msg else
                  res.json 201, files
    else
      res.json 400, message: 'content type must be multipart/form-data'

  app.post '/users/me/runnables/:id/files/:fileid', createindir
  app.post '/users/:userid/runnables/:id/files/:fileid', fetchuser, createindir

  getfile = (req, res) ->
    runnables.readFile req.domain, req.user_id, req.params.id, req.params.fileid, (err, file) ->
      if err then res.json err.code, message: err.msg else
        res.json file

  app.get '/users/me/runnables/:id/files/:fileid', getfile
  app.get '/users/:userid/runnables/:id/files/:fileid', fetchuser, getfile

  updatefile = (req, res) ->
    contentType = req.headers['content-type']
    if contentType is 'application/json'
      async.waterfall [
        (cb) ->
          file = null
          if not req.body.content? then cb null, file else
            runnables.updateFile req.domain, req.user_id, req.params.id, req.params.fileid, req.body.content, cb
        (file, cb) ->
          if not req.body.path? then cb null, file else
            runnables.moveFile req.domain, req.user_id, req.params.id, req.params.fileid, req.body.path, cb
        (file, cb) ->
          if not req.body.name? then cb null, file else
            runnables.renameFile req.domain, req.user_id, req.params.id, req.params.fileid, req.body.name, cb
        (file, cb) ->
          if not req.body.default? then cb null, file else
            runnables.defaultFile req.domain, req.user_id, req.params.id, req.params.fileid, req.body.default, cb
      ], (err, file) ->
        if err then res.json err.code, message: err.msg else
          if not file then res.json 400, message: 'must provide content, name, path or tag to update operation' else
            res.json file
    else
      if /multipart\/form-data/.test(contentType)
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
          files_array = [ ]
          for key, file of files
            files_array.push file
          runnables.readFile req.domain, req.user_id, req.params.id, req.params.fileid, (err, root) ->
            if err then res.json err.code, message: err.msg else
              if not root.dir then res.json 403, message: 'resource is not of directory type' else
                async.mapSeries files_array, (file, cb) ->
                  filestream = fs.createReadStream file.path
                  runnables.updateFileContents req.domain, req.user_id, req.params.id, "#{root.path}/#{root.name}/#{file.name}", filestream, cb
                , (err, files) ->
                  if err then res.json err.code, message: err.msg else
                    res.json 200, files
      else
        res.json 400, message: 'content type must be application/json or multipart/form-data'

  app.put '/users/me/runnables/:id/files/:fileid', updatefile
  app.patch '/users/me/runnables/:id/files/:fileid', updatefile
  app.put '/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile
  app.patch '/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile

  deletefile = (req, res) ->
    recursive = req.query.recursive?
    runnables.deleteFile req.domain, req.user_id, req.params.id, req.params.fileid, recursive, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'file deleted' }

  app.del '/users/me/runnables/:id/files/:fileid', deletefile
  app.del '/users/:userid/runnables/:id/files/:fileid', fetchuser, deletefile

  getmountedfiles = (req, res) ->
    mountDir = req.query.path or '/'
    runnables.getMountedFiles req.domain, req.user_id, req.params.id, req.params.fileid, mountDir, (err, files) ->
      if err then res.json err.code, message: err.msg else
        res.json files

  app.get '/users/me/runnables/:id/files/:fileid/files', getmountedfiles
  app.get '/users/:userid/runnables/:id/files/:fileid/files', fetchuser, getmountedfiles

  writemountedfiles = (req, res) ->
    res.json 403, message: 'mounted file-system is read-only'

  app.post '/users/me/runnables/:id/files/:fileid/files', writemountedfiles
  app.post '/users/:userid/runnables/:id/files/:fileid/files', fetchuser, writemountedfiles

  app