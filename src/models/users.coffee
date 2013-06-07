bcrypt = require 'bcrypt'
configs = require '../configs'
crypto = require 'crypto'
mongoose = require 'mongoose'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

userSchema = new Schema
  email:
    type: String
    index: true
  password:
    type: String
    index: true
  username:
    type: String
    index: true
  fb_userid:
    type: String
    index: true
  permission_level:
    type: Number
    default: 0
  created:
    type: Date
    default: Date.now

userSchema.index
  email:1
  password:1

userSchema.index
  username:1
  password:1

userSchema.set 'toJSON', { virtuals: true }

userSchema.virtual('email_md5').get () ->
  if not @email then null else
    hash = crypto.createHash 'md5'
    hash.update @email
    hash.digest 'hex'

userSchema.statics.createUser = (cb) ->
  user = new @
  user.save (err, user) ->
    if err then cb { code: 500, msg: 'error creating user' } else
      cb null, user

userSchema.statics.findUser = (params, cb) ->
  @findOne params, (err, user) ->
    if err then cb { code: 500, msg: 'error looking up user' } else
      if user
        userLifetime = (new Date()).getTime() - user.created.getTime()
        if userLifetime >= configs.cookieExpires and user.permission_level is 0
          user = null
      cb null, user

userSchema.statics.removeUser = (userId, cb) ->
  @remove { _id: userId }, (err) ->
    if err then cb { code: 500, msg: 'error removing user' } else cb()

userSchema.statics.loginUser = (login, password, cb) ->
  query = { $or: [ {username: login}, {email: login} ] }
  @findOne query,  (err, user) ->
    if err then cb { code: 500, msg: 'error looking up user' } else
      if not user then cb { code: 404, msg: 'user not found' } else
        if configs.passwordSalt
          bcrypt.compare password + configs.passwordSalt, user.password, (err, matches) ->
            if not matches then cb { code: 403, msg: 'invalid password' } else
              cb null, user
        else
          if password isnt user.password then cb { code: 403, msg: 'invalid password' } else
            cb null, user

userSchema.statics.registerUser = (userId, data, cb) ->
  setPassword = (password) =>
    @findOne { email: data.email }, (err, user) =>
      if err then cb { code: 500, msg: 'error looking up user' } else
        if user then cb { code: 403, msg: 'user already exists' } else
          cmd = $set:
            email: data.email
            password: password
            permission_level: 1
          if data.username then cmd.$set.username = data.username
          @findByIdAndUpdate userId, cmd, (err, user) ->
            if err then cb { code: 500, msg: 'error updating user document' } else
              cb null, user
  if not configs.passwordSalt then setPassword data.password else
    bcrypt.hash data.password + configs.passwordSalt, 10, (err, hash) ->
      if err then cb { code: 500, msg: 'error computing password hash' } else
        setPassword hash

module.exports = mongoose.model 'Users', userSchema