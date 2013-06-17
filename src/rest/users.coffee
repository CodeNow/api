configs = require '../configs'
express = require 'express'
users = require '../models/users'
runnables = require '../models/runnables'

usersApp = module.exports = express()

fetchuser = (req, res, next) ->
  users.findUser { _id: req.params.userid }, (err, user) ->
    if err then res.json err.code, { message: err.msg } else
      if not user then res.json 404, { message: 'user not found' } else
        if req.params.userid.toString() isnt req.session.user_id.toString()
          res.json 403, { message: 'permission denied' }
        else
          next()

getuser = (req, res) ->
  users.findUser { _id: req.session.user_id }, (err, user) ->
    if err then res.json err.code, { message: err.msg } else
      json_user = user.toJSON()
      delete json_user.password
      res.json json_user

deluser = (req, res) ->
  users.removeUser req.session.user_id, (err) ->
    if err then res.json err.code, { message: err.msg } else
      res.json { message: 'user deleted' }

putuser = (req, res) ->
  if req.user.permission_level isnt 0 then res.json 403, { message: 'you are already registered' } else
    if not req.body.email then res.json 400, { message: 'must provide an email to register with' } else
      if not req.body.password then res.json 400,  { message: 'must provide a password to user in the future' } else
        users.registerUser req.session.user_id, req.body, (err, user) ->
          if err then res.json err.code, { message: err.msg } else
            res.json user

postvote = (req, res) ->
  if not req.body.runnable then res.json 400, { message: 'must include runnable to vote on' } else
    runnables.isOwner req.session.user_id, req.body.runnable, (err, owner) ->
      if err then res.json err.code { message: err.msg } else
        if owner then res.json 403, { message: 'cannot vote for own runnables' } else
          users.findUser { _id: req.session.user_id }, (err, user) ->
            if err then res.json err.code, { message: err.msg } else
              user.vote req.body.runnable, (err, vote) ->
                if err then res.json err.code, { message: err.msg } else
                  res.json 201, vote

removevote = (req, res) ->
  users.findUser { _id: req.session.user_id }, (err, user) ->
    if err then res.json err.code, { message: err.msg } else
      user.removeVote req.params.voteid, (err) ->
        if err then res.json err.code, { message: err.msg } else
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
