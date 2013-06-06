configs = require '../configs'
errors = require '../errors'
express = require 'express'
users = require '../models/users'
utils = require '../utils'

app = module.exports = express()

getuser = (req, res, next) ->
  users.findUser { _id: req.session.user_id }, (err, user) ->
    if err then next err else
      if not user then res.json 404, { error: 'user not found' } else
        userLifetime = (new Date()).getTime() - user.created.getTime()
        if userLifetime >= configs.expires and not user.email then res.json 404, { error: 'user not found' } else
          json_user = user.toJSON()
          delete json_user.password
          res.json json_user

deluser = (req, res, next) ->
  users.removeUser req.session.user_id, (err) ->
    if err then next err else
      res.json 200, { message: 'user deleted' }

putuser = (req, res, next) ->

  createRequiredError = (err, field) ->
    if not req.body[field]
      if err
        delete err.message
        err.errors[field] = 'Required'
      else
        err = new errors.ValidationError utils.unCamelCase(field, " ", true) + "is required", field, 'Required'

  users.isRegisteredUser req.session.user_id, (err, exists) ->
    if exists then res.json 400, new errors.ValidationError 'Your are already registered', 'username', "already a user" else
      createRequiredError err, 'email'
      createRequiredError err, 'username'
      createRequiredError err, 'password'
      if err then res.json 400, err else
        users.registerUser req.session.user_id, req.body, (err, user) ->
          if err then res.json 400, new errors.ValidationError 'User already exists', 'confirmPassword', 'Blah' else
            res.json user.toJSON()

app.get '/users', (req, res, next) ->
  if not req.query.username and not req.query.email then res.json 400, { message: 'must provide a query' } else
    users.findUser req.query, (err, users) ->
      if err then next err else
        if not users then res.json 404, { message: 'user not found' } else
          res.json 200, users

app.get '/users/me', getuser
app.get '/users/:userid', (req, res, next) ->
  users.findUser { _id: req.params.userid }, (err, user) ->
    if err then next err else
      if not user then res.json 404, { error: 'user not found' } else
        if req.params.userid.toString() isnt req.session.user_id.toString()
          res.json 403, { error: 'no authorization' }
        else
          getuser req, res, next

app.del '/users/me', deluser
app.del '/users/:userid', (req, res, next) ->
  users.findUser { _id: req.params.userid }, (err, user) ->
    if err then next err else
      if not user then res.json 404, { error: 'user not found' } else
        if req.params.userid.toString() isnt req.session.user_id.toString()
          res.json 403, { error: 'no authroization' }
        else
          deluser req, res, next

app.put '/users/me', putuser
app.put '/users/:userid', (req, res, next) ->
  users.findUser { _id: req.params.userid }, (err, user) ->
    if err then next err else
      if not user then res.json 404, { error: 'user not found' } else
        if req.params.userid.toString() isnt req.session.user_id.toString()
          res.json 403, { error: 'no authorization' }
        else
          putuser(req, res, next);

app.post '/users/:userid/email', (req, res, next) ->
  users.set req.user._id, 'email', req.body.email, (err, user) ->
    if err then next err else
      res.json user.toJSON()

app.post '/users/auth', (req, res, next) ->

  err = null
  createRequiredError = (field) ->
    if not req.body[field]
      if err
        delete err.message;
        err.errors[field] = 'Required';
      else
        err = new errors.ValidationError utils.unCamelCase(field, " ", true)+" is required", field, 'Required'

  if req.body.signedRequest
    decoded = utils.decodeSignedRequest req.body.signedRequest, configs.fbloginSecret
    users.findUser { fb_userid: decoded.user_id}, (err, user) ->
      foundUser = false;
      if user
        userLifetime = ((new Date()).getTime() - user.created.getTime());
        if userLifetime < configs.expires or user.email
          foundUser = true;
      if foundUser
        req.session.user_id = user._id;
        res.json user.toJSON()
      else
        users.findUser {email: req.body.email }, (err, user) ->
          if err then next err else
            foundUser = false;
            if user
              userLifetime = (new Date()).getTime() - user.created.getTime()
              if userLifetime < configs.expires or user.email
                foundUser = true;
            if foundUser
              user.fb_userid = decoded.user_id
              user.save (err, user) ->
                if err then next err else
                  req.session.user_id = user._id;
                  res.json user.toJSON()
            else
              users.findUser { _id: req.session.user_id }, (err, user) ->
                user.username = req.body.username
                user.email = req.body.email
                user.fb_userid = decoded.user_id
                user.save (err, user) ->
                  if err then next err else
                    res.json user.toJSON()
  else
    if not req.body.email and not req.body.username
      createRequiredError 'username'
      createRequiredError 'email'
    createRequiredError('password');
    if err then res.json 400, err else
      emailOrUsername = req.body.username or req.body.email
      users.loginUser emailOrUsername, req.body.password, (err, user) ->
        if err
          if err.type is 'ValidationError'
            res.json 403, err
          else
            next err
        else
          users.isRegisteredUser req.session.user_id, (err, registered) ->
            if err then next err else
              if not registered
                users.removeUser req.session.user_id, (err) ->
                  if err then next err else
                    req.session.user_id = user._id
                    res.json user.toJSON()
              else
                req.session.user_id = user._id
                res.json user.toJSON()