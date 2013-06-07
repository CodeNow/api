configs = require './configs'
express = require 'express'
users = require './models/users'

app = module.exports = express()

app.all '/*', (req, res, next) ->

  create_user = () ->
    users.createUser (err, user) ->
      if err then res.json err.code, { messsage: err.msg } else
        req.session.regenerate (err) ->
          if err then res.json 500, { message: 'error regenerating session' } else
            req.session.user_id = user._id
            req.user = user
            next()

  if not req.session then res.json 500, { message: 'no session attached to this request' } else
    if not req.session.user_id then create_user() else
      users.findUser { _id: req.session.user_id }, (err, user) ->
        if err then res.json err.code, { message: err.msg } else
          if not user then create_user() else
            req.user = user
            next()

app.post '/login', (req, res, next) ->
  if not req.body.username and not req.body.email then res.json 400, { message: 'username or email required' } else
    if not req.body.password then res.json 400, { message: 'password required' } else
      login = req.body.email or req.body.username
      users.loginUser login, req.body.password, (err, user) ->
        if err then res.json err.code, { message: err.msg } else
          switch_user = () ->
            req.session.regenerate () ->
              req.session.user_id = user._id
              res.json user.toJSON()
          if req.user.permission_level isnt 0 then switch_user() else
            users.removeUser req.session.user_id, (err) ->
              if err then res.json err.code, { message: err.msg } else
                switch_user()

app.get '/logout', (req, res, next) ->
  logout_user = () ->
    req.session.destroy (err) ->
      if err then res.json 500, { message: 'error destroying user session' } else
        res.json { message: 'user logged out' }
  if req.user.permission_level isnt 0 then logout_user() else
    users.removeUser req.session.user_id, (err) ->
      if err then res.json err.code, { message: err.msg } else
      logout_user()