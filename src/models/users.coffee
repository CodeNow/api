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
  copies:
    type: Number
    default: 0
  pastes:
    type: Number
    default: 0
  cuts:
    type: Number
    default: 0
  runs:
    type: Number
    default: 0
  views:
    type: Number
    default: 0
  votes:
    type: [
      runnable:
        type: ObjectId
        index: {sparse:true}
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

userSchema.virtual('registered').get () ->
  this.permission_level >= 1

userSchema.virtual('isModerator').get () ->
  this.permission_level >= 5

userSchema.statics.createUser = (cb) ->
  user = new @
  user.save (err) =>
    if err then throw err
    cb null, user

userSchema.statics.findUser = (params, cb) ->
  @findOne params, (err, user) ->
    if err then throw err
    if user
      userLifetime = (new Date()).getTime() - user.created.getTime()
      if userLifetime >= configs.cookieExpires and user.permission_level is 0
        user = null
    cb null, user

userSchema.statics.removeUser = (userId, cb) ->
  @remove { _id: userId }, (err) ->
    if err then throw err
    cb()

userSchema.statics.loginUser = (login, password, cb) ->
  query = { $or: [ {username: login}, {email: login} ] }
  @findOne query, (err, user) ->
    if err then throw err
    if not user then cb error 404, 'user not found' else
      if configs.passwordSalt
        bcrypt.compare password + configs.passwordSalt, user.password, (err, matches) ->
          if err then throw err
          if not matches then cb error 403, 'invalid password' else
            cb null, user._id
      else
        if password isnt user.password then cb error 403, 'invalid password' else
          cb null, user._id

userSchema.statics.registerUser = (userId, data, cb) ->
  setPassword = (password) =>
    @findOne { email: data.email }, (err, user) =>
      if err then throw err
      if user then cb error 403, 'user already exists' else
        cmd = $set:
          email: data.email
          password: password
          permission_level: 1
        if data.username then cmd.$set.username = data.username
        @findByIdAndUpdate userId, cmd, (err, user) ->
          if err then throw err
          cb null, user
  if not configs.passwordSalt then setPassword data.password else
    bcrypt.hash data.password + configs.passwordSalt, 10, (err, hash) ->
      if err then throw err
      setPassword hash

userSchema.statics.publicListWithIds = (userIds, cb) ->
  fields =
    username : 1
    fb_userid: 1
    email    : 1
  @find _id: $in: userIds, fields, (err, users) ->
    if err then throw err
    cb null, users.map (user) ->
      user = user.toJSON()
      user.email = undefined
      user

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
  if found then cb error 403, 'cannot vote on runnable more than once' else
    @votes.push runnable: runnableId
    @save (err) =>
      if err then throw err
      vote = @votes[@votes.length-1].toJSON()
      vote.runnable = encodeId vote.runnable
      cb null, vote

userSchema.methods.removeVote = (voteId, cb) ->
  vote = @votes.id voteId
  if not vote then cb error 404, 'vote not found' else
    vote.remove()
    @save (err) ->
      if err then throw err
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
