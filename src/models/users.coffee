bcrypt = require 'bcrypt'
configs = require '../configs'
crypto = require 'crypto'
errors = require '../errors'
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

userSchema.statics.createUser = (cb) ->
  user = new @
  user.save (err, user) ->
    if err then cb err else
      cb null, user

userSchema.virtual('email_md5').get () ->
  if not @email then null else
    hash = crypto.createHash 'md5'
    hash.update @email
    hash.digest 'hex'

userSchema.statics.findUser = (params, cb) ->
  @findOne params, (err, user) ->
    if err then cb err else
      cb null, user

userSchema.statics.removeUser = (userId, cb) ->
  @remove { _id: userId }, cb

userSchema.statics.set = (userId, key, value, cb) ->
  update = { }
  update.$set = { }
  update.$set[key] = value
  @findByIdAndUpdate { _id : userId }, update, cb

userSchema.statics.isRegisteredUser = (userId, cb) ->
  @findById userId, (err, user) ->
    if err then cb err else
      cb null, user.permission_level >= 1

userSchema.statics.loginUser = (emailOrUsername, password, cb) ->
  self = @
  if configs.passwordSalt
    self.findOne { $or: [ { username: emailOrUsername }, { email: emailOrUsername } ]},  (err, user) ->
      if err then cb err else
        if not user
          err = new errors.ValidationError 'Account not found.',
            username: 'Not found',
            email   : 'Not found'
          cb err
        else
          bcrypt.compare password + configs.passwordSalt, user.password, (err, matches) ->
            if matches then cb null, user else
              err = new errors.ValidationError 'Incorrect password.',
                password: "Incorrect"
              cb err
  else
    self.findOne { $or: [ { username: emailOrUsername }, { email: emailOrUsername } ], password: password }, (err, user) ->
      if err then cb err else
        if not user
          err = new errors.ValidationError 'Incorrect password.',
            password: "Incorrect"
          cb err
        else
          cb null, user

userSchema.statics.registerUser = (userId, data, cb) ->
  self = @
  if configs.passwordSalt
    bcrypt.hash data.password + configs.passwordSalt, 10, (err, hash) ->
      if err then cb err else
        self.findOne { email: data.email }, (err, user) ->
          if err then cb err else
            if user then  cb new Error 'User already exists' else
              self.findOne { username: data.username }, (err, user) ->
                if err then cb err else
                  if user then cb new Error 'User already exists' else
                    self.findByIdAndUpdate userId,
                      $set:
                        email: data.email
                        username: data.username
                        password: hash
                        permission_level: 1
                    , (err, user) ->
                      if err then cb err else
                        cb null, user
  else
    self.findByIdAndUpdate userId,
      $set:
        email: data.email,
        username: data.username,
        password: data.password
    , (err, user) ->
      if err then cb err else
        cb null, user

module.exports = mongoose.model 'Users', userSchema