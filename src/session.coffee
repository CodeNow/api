configs = require './configs'
express = require 'express'
users = require './models/users'

app = module.exports = express()

app.all '/*', (req, res, next) ->

  create_user = () ->
    users.createUser (err, user) ->
      if err then res.json 500, err.message else
        if not user then res.json 500, { message: 'could not create user' } else
          req.session.user_id = user._id
          req.user = user
          delete req.user.password
          next()

  if not req.session then res.json 500, { message: 'session object does not exist' } else
    if not req.session.user_id then create_user() else
      users.findUser { _id: req.session.user_id }, (err, user) ->
        if err then next err else
          if not user then create_user() else
            userLifetime = ((new Date()).getTime() - user.created.getTime())
            if userLifetime >= configs.expires and not user.email then create_user() else
              req.user = user
              delete req.user.password
              next()

app.get '/logout', (req, res, next) ->
  if not req.user.email
    users.removeUser req.session.user_id, (err) ->
      if err then res.json 500, err.message else
        req.session.destroy()
        res.json 200, { message: 'successfully logged out' }
  else
    req.session.destroy()
    res.json 200, { message: 'successfully logged out' }