async = require 'async'
configs = require '../configs'
debug = require('debug')('users')
error = require '../error'
express = require 'express'
users = require '../models/users'
redis = require 'redis'
runnables = require '../models/runnables'
uuid = require 'node-uuid'
_ = require 'lodash'
url = require 'url'

redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress)
app = module.exports = express()

fetchuser = (req, res, next) ->
  users.findUser _id: req.params.userid, (err, user) ->
    if err then res.json err.code, message: err.msg else
      if not user then res.json err.code, message: 'user not found' else
        if req.params.userid.toString() isnt req.user_id.toString() then res.json 403, message: 'permission denied' else
          next()

app.post '/users', (req, res) ->
  users.createUser (err, user) ->
    if err then cb err else
      access_token = uuid.v4()
      redis_client.psetex [ access_token, configs.tokenExpires, user._id ], (err) ->
        if err then throw err
        json_user = user.toJSON()
        json_user.access_token = access_token
        if not req.body.email then res.json 201, json_user else
          if not req.body.username then res.json 400, message: 'must provide a username to register with' else
            if not req.body.password then res.json 400, message: 'must provide a password to register with' else
              data = _.pick req.body, 'email', 'username', 'password'
              users.registerUser user._id, data, (err, user) ->
                if err then cb err else
                  json_user = user.toJSON()
                  delete json_user.password
                  json_user.access_token = access_token
                  res.json 201, json_user

app.post '/token', (req, res) ->
  if not req.body.username and not req.body.email then res.json 400, message: 'username or email required' else
    if not req.body.password then res.json 400, message: 'password required' else
      identity = req.body.email or req.body.username
      users.loginUser identity, req.body.password, (err, user_id) ->
        access_token = uuid.v4()
        redis_client.psetex [ access_token, configs.tokenExpires, user_id ], (err) ->
          if err then throw err
          res.json access_token: access_token

app.all '*', (req, res, next) ->
  if (/\/runnables\?map=true|\/channels/.test(url.parse(req.url).path))
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
    users.publicListWithIds userIds, (err, users) ->
      if err then cb err else
        res.json users

app.get '/users', getusers

getuser = (req, res) ->
  users.findUser _id: req.user_id, (err, user) ->
    if err then cb err else
      if not user then res.json 404, message: 'user doesnt exist' else
        json_user = user.toJSON()
        delete json_user.password
        delete json_user.votes
        res.json json_user

app.get '/users/me', getuser
app.get '/users/:userid', fetchuser, getuser

deluser = (req, res) ->
  users.removeUser req.user_id, () ->
    res.json { message: 'user deleted' }

app.del '/users/me', deluser
app.del '/users/:userid', fetchuser, deluser

putuser = (req, res) ->
  users.findUser _id: req.user_id, (err, user) ->
    if err then res.json err.code, message: err.message else
      if user.permission_level isnt 0 then res.json 403, message: 'you are already registered' else
        if not req.body.email then res.json 400, message: 'must provide an email to register with' else
          if not req.body.username then res.json 400, message: 'must provide a username to register with' else
            if not req.body.password then res.json 400, message: 'must provide a password to register with' else
              data = _.pick req.body, 'email', 'username', 'password'
              users.registerUser req.user_id, data, (err, user) ->
                if err then cb err else
                  res.json user

app.put '/users/me', putuser
app.put '/users/:userid', fetchuser, putuser

getvotes = (req, res) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then res.json err.code, message: err.msg else
      res.json user.getVotes()

app.get '/users/me/votes', getvotes
app.get '/users/:userid/votes', fetchuser, getvotes

postvote = (req, res) ->
  if not req.body.runnable then res.json 400, message: 'must include runnable to vote on' else
    runnables.vote req.user_id, req.body.runnable, (err, vote) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, vote

app.post '/users/me/votes', postvote
app.post '/users/:userid/votes', fetchuser, postvote

removevote = (req, res) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    user.removeVote req.params.voteid, (err) ->
      if err then res.json err.code, message: err.msg else
        res.json { message: 'removed vote' }

app.del '/users/me/votes/:voteid', removevote
app.del '/users/:userid/votes/:voteid', fetchuser, removevote

postrunnable = (req, res) ->
  if not req.query.from then res.json 400, message: 'must provide a runnable to fork from' else
    runnables.createContainer req.user_id, req.query.from, (err, container) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, container

app.post '/users/me/runnables', postrunnable
app.post '/users/:userid/runnables', fetchuser, postrunnable

getrunnables = (req, res) ->
  parent = req.query.parent
  runnables.listContainers req.user_id, parent, (err, containers) ->
    if err then res.json err.code, message: err.msg else
      res.json containers

app.get '/users/me/runnables', getrunnables
app.get '/users/:userid/runnables', fetchuser, getrunnables

getrunnable = (req, res) ->
  runnables.getContainer req.user_id, req.params.runnableid, (err, container) ->
    if err then res.json err.code, message: err.msg else
      res.json container

app.get '/users/me/runnables/:runnableid', getrunnable
app.get '/users/:userid/runnables/:runnableid', fetchuser, getrunnable

putrunnable = (req, res) ->
  if not req.body.running? then res.json 400, message: 'must provide a running parameter' else
    if not req.body.name? then res.json 400, message: 'must provide a runnable name' else
      runnables.updateName req.user_id, req.params.runnableid, req.body.name, (err, runnable) ->
        if err then res.json err.code, message: err.msg else
          if req.body.running
            runnables.startContainer req.user_id, req.params.runnableid, (err, runnable) ->
              res.json runnable
          else
            runnables.stopContainer req.user_id, req.params.runnableid, (err, runnable) ->
              res.json runnable

app.put '/users/me/runnables/:runnableid', putrunnable
app.put '/users/:userid/runnables/:runnableid', fetchuser, putrunnable

delrunnable = (req, res) ->
  runnables.removeContainer req.user_id, req.params.runnableid, (err) ->
    if err then res.json err.code, message: err.msg else
      res.json { message : 'runnable deleted' }

app.del '/users/me/runnables/:runnableid', delrunnable
app.del '/users/:userid/runnables/:runnableid', fetchuser, delrunnable

gettags = (req, res) ->
  runnables.getContainerTags req.params.id, (err, tags) ->
    if err then res.json err.code, message: err.msg else
      res.json tags

app.get '/users/me/runnables/:id/tags', gettags
app.get '/users/:userid/runnables/:id/tags', fetchuser, gettags

posttag = (req, res) ->
  if not req.body.name then res.json 400, message: 'tag must include a name field' else
    runnables.addContainerTag req.user_id, req.params.id, req.body.name, (err, tag) ->
      if err then res.json err.code, message: err.msg else
        res.json 201, tag

app.post '/users/me/runnables/:id/tags', posttag
app.post '/users/:userid/runnables/:id/tags', fetchuser, posttag

gettag = (req, res) ->
  runnables.getContainerTag req.params.id, req.params.tagId, (err, tag) ->
    if err then res.json err.code, message: err.msg else
      res.json tag

app.get '/users/me/runnables/:id/tags/:tagId', gettag
app.get '/users/:userid/runnables/:id/tags/:tagId', fetchuser, gettag

deltag = (req, res) ->
  runnables.removeContainerTag req.user_id, req.params.id, req.params.tagId, (err) ->
    if err then res.json err.code, message: err.msg else
      res.json { message: 'tag deleted' }

app.del '/users/me/runnables/:id/tags/:tagId', deltag
app.del '/users/:userid/runnables/:id/tags/:tagId', fetchuser, deltag

listfiles = (req, res) ->
  content = req.query.content?
  dir = req.query.dir?
  default_tag = req.query.default?
  path = req.query.path
  runnables.listFiles req.params.runnableid, content, dir, default_tag, path, (err, files) ->
    if err then res.json err.code, message: err.msg else
      res.json files

app.get '/users/me/runnables/:runnableid/files', listfiles
app.get '/users/:userid/runnables/:runnableid/files', fetchuser, listfiles

syncfiles = (req, res) ->
  runnables.syncFiles req.params.id, (err) ->
    if err then res.json err.code, message: err.msg else
      res.json 201, { message: 'files synced successfully', date: new Date }

app.post '/users/me/runnables/:id/sync', syncfiles
app.post '/users/:userid/runnables/:id/sync', fetchuser, syncfiles

createfile = (req, res) ->
  if req.body.dir
    if not req.body.name then res.json 400, 'dir must include a name field' else
      if not req.body.path then res.json 400, 'dir must include a path field'  else
        runnables.createDirectory req.user_id, req.params.id, req.body.name, req.body.path, (dir) ->
          res.json 201, dir
  else
    if not req.body.name then res.json 400, 'file must include a name field' else
      if not req.body.content then res.json 400, 'file must include a content field' else
        if not req.body.path then res.json 400, 'file must include a path field' else
          runnables.createFile req.user_id, req.params.id, req.body.name, req.body.path, req.body.content, (file) ->
            res.json 201, file

app.post '/users/me/runnables/:id/files', createfile
app.post '/users/:userid/runnables/:id/files', fetchuser, createfile

getfile = (req, res) ->
  runnables.readFile req.params.id, req.params.fileid, (err, file) ->
    if err then res.json err.code, message: err.msg else
      res.json file

app.get '/users/me/runnables/:id/files/:fileid', getfile
app.get '/users/:userid/runnables/:id/files/:fileid', fetchuser, getfile

updatefile = (req, res) ->
  async.waterfall [
    (cb) ->
      if not req.body.content then cb() else
        runnables.updateFile req.user_id, req.params.id, req.params.fileid, req.body.content, cb
    (file, cb) ->
      if not req.body.path then cb null, file else
        runnables.moveFile req.user_id, req.params.id, req.params.fileid, req.body.path, cb
    (file, cb) ->
      if not req.body.name then cb null, file else
        runnables.renameFile req.user_id, req.params.id, req.params.fileid, req.body.name, cb
    (file, cb) ->
      if not req.body.default then cb null, file else
        runnables.defaultFile req.user_id, req.params.id, req.params.fileid, cb
  ], (err, file) ->
    if err then res.json err.code, message: err.msg else
      if not file then res.json 400, 'must provide content, name, path or tag to update operation' else
        res.json file

app.put '/users/me/runnables/:id/files/:fileid', updatefile
app.patch '/users/me/runnables/:id/files/:fileid', updatefile
app.put '/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile
app.patch '/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile

deletefile = (req, res) ->
  recursive = req.query.recursive?
  runnables.deleteFile req.params.id, req.params.fileid, recursive, (err) ->
    if err then res.json err.code, message: err.msg else
      res.json { message: 'file deleted' }

app.del '/users/me/runnables/:id/files/:fileid', deletefile
app.del '/users/:userid/runnables/:id/files/:fileid', fetchuser, deletefile