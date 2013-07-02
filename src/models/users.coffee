bcrypt = require 'bcrypt'
configs = require '../configs'
crypto = require 'crypto'
error = require '../error'
mongoose = require 'mongoose'
images = require './images'

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
  votes:
    type: [
      runnable: ObjectId
    ]
    default: [ ]

userSchema.index
  email:1
  password:1

userSchema.index
  username:1
  password:1

userSchema.set 'toJSON', { virtuals: true }

userSchema.virtual('gravitar').get () ->
  if not @email then undefined else
    hash = crypto.createHash 'md5'
    hash.update @email
    ghash = hash.digest 'hex'
    "http://www.gravatar.com/avatar/#{ghash}"

userSchema.statics.createUser = (cb) ->
  user = new @
  user.save (err, user) =>
    if err then cb new error { code: 500, msg: 'error creating user' } else
      cb null, user

userSchema.statics.findUser = (params, cb) ->
  @findOne params, (err, user) ->
    if err then cb new error { code: 500, msg: 'error looking up user' } else
      if user
        userLifetime = (new Date()).getTime() - user.created.getTime()
        if userLifetime >= configs.cookieExpires and user.permission_level is 0
          user = null
      cb null, user

userSchema.statics.removeUser = (userId, cb) ->
  @remove { _id: userId }, (err) ->
    if err then cb new error { code: 500, msg: 'error removing user' } else cb()

userSchema.statics.loginUser = (login, password, cb) ->
  query = { $or: [ {username: login}, {email: login} ] }
  @findOne query,  (err, user) ->
    if err then cb new error { code: 500, msg: 'error looking up user' } else
      if not user then cb new error { code: 404, msg: 'user not found' } else
        if configs.passwordSalt
          bcrypt.compare password + configs.passwordSalt, user.password, (err, matches) ->
            if not matches then cb new error { code: 403, msg: 'invalid password' } else
              cb null, user._id
        else
          if password isnt user.password then cb new error { code: 403, msg: 'invalid password' } else
            cb null, user._id

userSchema.statics.registerUser = (userId, data, cb) ->
  setPassword = (password) =>
    @findOne { email: data.email }, (err, user) =>
      if err then cb new error { code: 500, msg: 'error looking up user' } else
        if user then cb new error { code: 403, msg: 'user already exists' } else
          cmd = $set:
            email: data.email
            password: password
            permission_level: 1
          if data.username then cmd.$set.username = data.username
          @findByIdAndUpdate userId, cmd, (err, user) ->
            if err then cb new error { code: 500, msg: 'error updating user document' } else
              cb null, user
  if not configs.passwordSalt then setPassword data.password else
    bcrypt.hash data.password + configs.passwordSalt, 10, (err, hash) ->
      if err then cb new error { code: 500, msg: 'error computing password hash' } else
        setPassword hash

userSchema.methods.getVotes = () ->
  votes = [ ]
  for vote in @votes
    json_vote = vote.toJSON()
    json_vote.runnable = encodeId json_vote.runnable
    votes.push json_vote
  votes

userSchema.methods.addVote = (runnableId, cb) ->
  found = false
  for vote in @votes
    if vote.runnable.toString() is runnableId.toString()
      found = true
  if found then cb new error { code: 403, msg: 'cannot vote on runnable more than once' } else
    @votes.push runnable: runnableId
    @save (err) =>
      if err then cb new error { code: 500, msg: 'error saving vote in mongodb' } else
        vote = @votes[@votes.length-1].toJSON()
        vote.runnable = encodeId vote.runnable
        cb null, vote

userSchema.methods.removeVote = (voteId, cb) ->
  vote = @votes.id voteId
  if not vote then cb new error { code: 404, msg: 'vote not found' } else
    vote.remove()
    @save (err) ->
      if err then cb new error { code: 500, msg: 'error saving vote in mongodb' } else
        cb()

module.exports = mongoose.model 'Users', userSchema

plus = /\+/g
slash = /\//g
minus = /-/g
underscore = /_/g

encodeId = (id) -> id
decodeId = (id) -> id

if configs.shortProjectIds
  encodeId = (id) -> (new Buffer(id.toString(), 'hex')).toString('base64').replace(plus,'-').replace(slash,'_')
  decodeId = (id) -> (new Buffer(id.toString().replace(minus,'+').replace(underscore,'/'), 'base64')).toString('hex');
