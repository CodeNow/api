configs = require '../configs'
express = require 'express'
users = require '../models/users'
redis = require 'redis'
runnables = require '../models/runnables'
uuid = require 'node-uuid'

redis_client = redis.createClient()
usersApp = module.exports = express()

usersApp.post '/users', (req, res, next) ->
  if (req.body.username or req.body.email) and not req.body.password then next { code: 400, msg: 'must provide password' } else
    if req.body.username or req.body.email
      users.createUser
        username: req.body.username
        email: req.body.email
        password: req.body.password
      , (err, user) ->
        if err then next err else
          access_token = uuid.v4()
          redis_client.psetex [ access_token, configs.tokenExpires, user._id ], (err) ->
            if err then next { code: 500, msg: 'error storing access token in redis' } else
              json_user = user.toJSON()
              delete json_user.password
              json_user.access_token = access_token
              res.json 201, json_user
    else
      users.createUser null, (err, user, next) ->
        if err then next err else
          access_token = uuid.v4()
          redis_client.psetex [ access_token, configs.tokenExpires, user._id ], (err) ->
            if err then next { code: 500, msg: 'error storing access token in redis' } else
              json_user = user.toJSON()
              json_user.access_token = access_token
              res.json 201, json_user

usersApp.post '/token', (req, res, next) ->
  if not req.body.username and not req.body.email then next { code: 400, msg: 'username or email required' } else
    if not req.body.password then next { code: 400, msg: 'password required' } else
      identity = req.body.email or req.body.username
      users.loginUser identity, req.body.password, (err, user_id) ->
        if err then next err else
          access_token = uuid.v4()
          redis_client.psetex [ access_token, configs.tokenExpires, user_id ], (err) ->
            if err then next { code: 500, msg: 'error storing access token in redis' } else
              res.json access_token: access_token

usersApp.all '*', (req, res, next) ->
  token = req.get('runnable-token');
  if not token then next { code: 401, msg: 'access token required' } else
    redis_client.get token, (err, user_id) ->
      if err then next { code: 500, msg: 'error looking up access token in redis' } else
        if not user_id then next { code: 401, msg: 'must provide a valid access token' } else
          req.user_id = user_id
          req.token = token
          next()

fetchuser = (req, res, next) ->
  users.findUser { _id: req.params.userid }, (err, user) ->
    if err then next err else
      if not user then next { code: 404, msg: 'user not found' } else
        if req.params.userid.toString() isnt req.user_id.toString()
          next { code: 403, msg: 'permission denied' }
        else
          next()

getuser = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next err else
      json_user = user.toJSON()
      delete json_user.password
      res.json json_user

deluser = (req, res, next) ->
  users.removeUser req.user_id, (err) ->
    if err then next err else
      redis_client.del req.token, (err) ->
        if err then next { code: 500, msg: 'error removing access token' } else
          res.json { message: 'user deleted' }

putuser = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next err else
      if user.permission_level isnt 0 then next { code: 403, msg: 'you are already registered' } else
        if not req.body.email then next { code: 400, msg: 'must provide an email to register with' } else
          if not req.body.password then next { code: 400,  msg: 'must provide a password to user in the future' } else
            users.registerUser req.user_id, req.body, (err, user) ->
              if err then next err else
                res.json user

postvote = (req, res, next) ->
  if not req.body.runnable then next { code: 400, msg: 'must include runnable to vote on' } else
    runnables.isOwner req.user_id, req.body.runnable, (err, owner) ->
      if err then next err else
        if owner then next { code: 403, msg: 'cannot vote for own runnables' } else
          users.findUser { _id: req.user_id }, (err, user) ->
            if err then next err else
              user.vote req.body.runnable, (err, vote) ->
                if err then next err else
                  res.json 201, vote

removevote = (req, res, next) ->
  users.findUser { _id: req.user_id }, (err, user) ->
    if err then next err else
      user.removeVote req.params.voteid, (err) ->
        if err then next err else
          res.json 200, { message: 'removed vote' }

usersApp.get '/users/me', getuser
usersApp.get '/users/:userid', fetchuser, getuser

usersApp.del '/users/me', deluser
usersApp.del '/users/:userid', fetchuser, deluser

usersApp.put '/users/me', putuser
usersApp.put '/users/:userid', fetchuser, putuser

usersApp.post '/users/me/votes', postvote
usersApp.post '/users/:userid/votes', fetchuser, postvote

usersApp.del '/users/me/votes/:voteid', removevote
usersApp.del '/users/:userid/votes/:voteid', fetchuser, removevote
