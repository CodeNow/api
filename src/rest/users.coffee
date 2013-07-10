configs = require '../configs'
error = require '../error'
express = require 'express'
users = require '../models/users'
redis = require 'redis'
runnables = require '../models/runnables'
uuid = require 'node-uuid'
_ = require 'lodash'

redis_client = redis.createClient()
app = module.exports = express()

app.post '/users', (req, res, next) ->
  users.createUser (err, user) ->
    if err then next err else
      access_token = uuid.v4()
      redis_client.psetex [ access_token, configs.tokenExpires, user._id ], (err) ->
        if err then next new error { code: 500, msg: 'error storing access token in redis' } else
          json_user = user.toJSON()
          json_user.access_token = access_token
          if not req.body.email then res.json 201, json_user else
            if not req.body.username then next new error { code: 400,  msg: 'must provide a username to register with' } else
              if not req.body.password then next new error { code: 400,  msg: 'must provide a password to register with' } else
                data = _.pick req.body, 'email', 'username', 'password'
                users.registerUser user._id, data, (err, user) ->
                  if err then next err else
                    json_user = user.toJSON()
                    delete json_user.password
                    json_user.access_token = access_token
                    res.json 201, json_user

app.post '/token', (req, res, next) ->
  if not req.body.username and not req.body.email then next new error { code: 400, msg: 'username or email required' } else
    if not req.body.password then next new error { code: 400, msg: 'password required' } else
      identity = req.body.email or req.body.username
      users.loginUser identity, req.body.password, (err, user_id) ->
        if err then next err else
          access_token = uuid.v4()
          redis_client.psetex [ access_token, configs.tokenExpires, user_id ], (err) ->
            if err then next new error { code: 500, msg: 'error storing access token in redis' } else
              res.json access_token: access_token

app.all '*', (req, res, next) ->
  token = req.get('runnable-token');
  if not token then next new error { code: 401, msg: 'access token required' } else
    redis_client.get token, (err, user_id) ->
      if err then next { code: 500, msg: 'error looking up access token in redis' } else
        if not user_id then next new error { code: 401, msg: 'must provide a valid access token' } else
          req.user_id = user_id
          next()

fetchuser = (req, res, next) ->
  users.findUser { _id: req.params.userid }, (err, user) ->
    if err then next err else
      if not user then next new error { code: 404, msg: 'user not found' } else
        if req.params.userid.toString() isnt req.user_id.toString()
          next new error { code: 403, msg: 'permission denied' }
        else
          next()

getuser = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next new error { code: 500, msg: 'error looking up user in mongodb' } else
      if not user then next new error { code: 404, msg: 'user doesnt exist' } else
        json_user = user.toJSON()
        delete json_user.password
        delete json_user.votes
        res.json json_user

getusers = (req, res, next) ->
  userIds = req.query.ids
  if (!req.query.ids || !req.query.ids.length == 0)
    next(new error({
      code: 400,
      msg: 'must provide a ids for users to get'
    }));
  else
    users.publicListWithIds userIds, (err, users) ->
      if err then next err else
        res.json users

deluser = (req, res, next) ->
  users.removeUser req.user_id, (err) ->
    if err then next err else
      res.json { message: 'user deleted' }

putuser = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next err else
      if user.permission_level isnt 0 then next new error { code: 403, msg: 'you are already registered' } else
        if not req.body.email then next new error { code: 400, msg: 'must provide an email to register with' } else
          if not req.body.username then next new error { code: 400, msg: 'must provide a username to register with' } else
            if not req.body.password then next new error { code: 400,  msg: 'must provide a password to register with' } else
              data = _.pick req.body, 'email', 'username', 'password'
              users.registerUser req.user_id, data, (err, user) ->
                if err then next err else
                  res.json user

getvotes = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next new error { code: 500, msg: 'error looking up user in mongodb' } else
      res.json user.getVotes()

postvote = (req, res, next) ->
  if not req.body.runnable then next new error { code: 400, msg: 'must include runnable to vote on' } else
    runnables.vote req.user_id, req.body.runnable, (err, vote) ->
      if err then next err else
        res.json 201, vote

removevote = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next err else
      user.removeVote req.params.voteid, (err) ->
        if err then next err else
          res.json 200, { message: 'removed vote' }

getrunnables = (req, res, next) ->
  parent = req.query.parent
  runnables.listContainers req.user_id, parent, (err, containers) ->
    if err then next err else
      res.json 200, containers

getrunnable = (req, res, next) ->
  runnables.getContainer req.user_id, req.params.runnableid, (err, container) ->
    if err then next err else
      res.json 200, container

putrunnable = (req, res, next) ->
  if not req.body.running? then next new error { code: 400, msg: 'must provide a running parameter' } else
    if not req.body.name? then next new error { code: 400, msg: 'must provide a runnable name' } else
      runnables.updateName req.user_id, req.params.runnableid, req.body.name, (err, runnable) ->
        if err then next err else
          if req.body.running
            runnables.startContainer req.user_id, req.params.runnableid, (err, runnable) ->
              if err then next err else
                res.json runnable
          else
            runnables.stopContainer req.user_id, req.params.runnableid, (err, runnable) ->
              if err then next err else
                res.json runnable

accessrunnable = (req, res, next) ->
  runnables.touchContainer req.user_id, req.params.runnableid, (err) ->
    if err then next err else
      res.json 200, { message: 'runnable touched' }

delrunnable = (req, res, next) ->
  runnables.removeContainer req.user_id, req.params.runnableid, (err) ->
    if err then next err else
      res.json 200, { message : 'runnable deleted' }

postrunnable = (req, res, next) ->
  if not req.query.from then next { code: 400, msg: 'must provide a runnable to fork from' } else
    runnables.createContainer req.user_id, req.query.from, (err, container) ->
      if err then next err else
        res.json 201, container

readDir = (req, res, next) ->
  runnables.readDir req.params.runnableid, req.query.path, (err, dirContents) ->
    if err then next err else
      res.json 200, dirContents

changeFile = (req, res, next) ->
  runnables.changeFile req.params.runnableid, req.body.path, req.body.content, (err, updated) ->
    if err then next err else
      res.json 200, updated

listfiles = (req, res, next) ->
  content = req.query.content?
  dir = req.query.dir?
  default_tag = req.query.default?
  path = req.query.path
  runnables.listFiles req.params.runnableid, content, dir, default_tag, path, (err, files) ->
    if err then next err else
      res.json 200, files

createfile = (req, res, next) ->
  if req.body.dir
    if not req.body.name then next new error { code: 400, msg: 'dir must include a name field' } else
      if not req.body.path then next new error { code: 400, msg: 'dir must include a path field' } else
        runnables.createDirectory req.user_id, req.params.id, req.body.name, req.body.path, (err, dir) ->
          if err then next err else
            res.json 201, dir
  else
    if not req.body.name then next new error { code: 400, msg: 'file must include a name field' } else
      if not req.body.content then next new error { code: 400, msg: 'file must include a content field' } else
        if not req.body.path then next new error { code: 400, msg: 'file must include a path field' } else
          runnables.createFile req.user_id, req.params.id, req.body.name, req.body.path, req.body.content, (err, file) ->
            if err then next err else
              res.json 201, file

getfile = (req, res, next) ->
  runnables.readFile req.params.id, req.params.fileid, (err, file) ->
    if err then next err else
      res.json 200, file

updatefile = (req, res, next) ->
  if not req.body.content?
    if not req.body.path?
      if not req.body.name?
        if not req.body.default?
          next new error { code: 400, msg: 'must provide content, name, path or tag to update operation' }
        else
          runnables.defaultFile req.user_id, req.params.id, req.params.fileid, (err, file) ->
            if err then next err else
              res.json 200, file
      else
        runnables.renameFile req.user_id, req.params.id, req.params.fileid, req.body.name, (err, file) ->
          if err then next err else
            res.json 200, file
    else
      runnables.moveFile req.user_id, req.params.id, req.params.fileid, req.body.path, (err, file) ->
        if err then next err else
          res.json 200, file
  else
    runnables.updateFile req.user_id, req.params.id, req.params.fileid, req.body.content, (err, file) ->
      if err then next err else
        res.json 200, file

deleteallfiles = (req, res, next) ->
  runnables.deleteAllFiles req.params.id, (err) ->
    if err then next err else
      res.json 200, { message: 'deleted all files' }

deletefile = (req, res, next) ->
  recursive = req.query.recursive?
  runnables.deleteFile req.params.id, req.params.fileid, recursive, (err) ->
    if err then next err else
      res.json 200, { message: 'file deleted' }

app.get '/users', getusers

app.get '/users/me', getuser
app.get '/users/:userid', fetchuser, getuser

app.del '/users/me', deluser
app.del '/users/:userid', fetchuser, deluser

app.put '/users/me', putuser
app.put '/users/:userid', fetchuser, putuser

app.get '/users/me/votes', getvotes
app.get '/users/:userid/votes', fetchuser, getvotes

app.post '/users/me/votes', postvote
app.post '/users/:userid/votes', fetchuser, postvote

app.del '/users/me/votes/:voteid', removevote
app.del '/users/:userid/votes/:voteid', fetchuser, removevote

app.post '/users/me/runnables', postrunnable
app.post '/users/:userid/runnables', fetchuser, postrunnable

app.get '/users/me/runnables', getrunnables
app.get '/users/:userid/runnables', fetchuser, getrunnables

app.get '/users/me/runnables/:runnableid', getrunnable
app.get '/users/:userid/runnables/:runnableid', fetchuser, getrunnable

app.put '/users/me/runnables/:runnableid', putrunnable
app.put '/users/:userid/runnables/:runnableid', fetchuser, putrunnable

app.del '/users/me/runnables/:runnableid', delrunnable
app.del '/users/:userid/runnables/:runnableid', fetchuser, delrunnable

app.get '/users/me/runnables/:runnableid/last_access', accessrunnable
app.get '/users/:userid/runnables/:runnableid/last_access', fetchuser, accessrunnable

app.get '/users/me/runnables/:runnableid/files', listfiles
app.get '/users/:userid/runnables/:runnableid/files', fetchuser, listfiles

app.post '/users/me/runnables/:id/files', createfile
app.post '/users/:userid/runnables/:id/files', fetchuser, createfile

app.get '/users/me/runnables/:id/files/:fileid', getfile
app.get '/users/:userid/runnables/:id/files/:fileid', fetchuser, getfile

app.put '/users/me/runnables/:id/files/:fileid', updatefile
app.put '/users/:userid/runnables/:id/files/:fileid', fetchuser, updatefile

app.del '/users/me/runnables/:id/files', deleteallfiles
app.del '/users/:userid/runnables/:id/files', fetchuser, deleteallfiles

app.del '/users/me/runnables/:id/files/:fileid', deletefile
app.del '/users/:userid/runnables/:id/files/:fileid', fetchuser, deletefile

app.get '/users/me/runnables/:runnableid/readDir', readDir

# app.get '/users/me/runnables/:runnableid/fileTree', getFileTree
