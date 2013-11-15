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
  name:
    type: String
  company:
    type: String
  username:
    type: String
    index: true
  lower_username:
    type: String
    index: {sparse:true}
  show_email:
    type: Boolean
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

# common user lookup
userSchema.index
  _id: 1
  created: 1
  permission_level: 1

userSchema.set 'toJSON', { virtuals: true }
userSchema.set 'autoIndex', false

userSchema.virtual('gravitar').get () ->
  if not @email then undefined else
    hash = crypto.createHash 'md5'
    hash.update @email
    ghash = hash.digest 'hex'
    "http://www.gravatar.com/avatar/#{ghash}"

userSchema.virtual('registered').get () ->
  this.permission_level >= 1

userSchema.virtual('isVerified').get () ->
  this.permission_level >= 2

userSchema.virtual('isModerator').get () ->
  this.permission_level >= 5

userSchema.statics.createUser = (domain, cb) ->
  user = new @
  user.save domain.intercept () ->
    cb null, user

userSchema.statics.findUser = (domain, params, cb) ->
  minCreated = Date.now() - configs.tokenExpires
  params['$or'] = [ { created: $gte: minCreated }, { permission_level: $gt: 0 } ]
  @findOne params, domain.intercept (user) ->
    cb null, user

userSchema.statics.removeUser = (domain, userId, cb) ->
  @remove { _id: userId }, domain.intercept () ->
    cb()

userSchema.statics.loginUser = (domain, login, password, cb) ->
  query = { $or: [ {username: login}, {email: login} ] }
  @findOne query, domain.intercept (user) ->
    if not user then cb error 404, 'user not found' else
      if configs.passwordSalt
        bcrypt.compare password + configs.passwordSalt, user.password, (err, matches) ->
          if err then throw err
          if not matches then cb error 403, 'invalid password' else
            cb null, user._id
      else
        if password isnt user.password then cb error 403, 'invalid password' else
          cb null, user._id

userSchema.statics.updateUser = (domain, userId, data, fields, cb) ->
  if typeof fields is 'function'
    cb = fields
    fields = null
  options = if fields then fields:fields else {}
  @findOneAndUpdate {_id:userId}, {$set:data}, options, domain.intercept (user) ->
    cb null, user.toJSON()

userSchema.statics.registerUser = (domain, userId, data, cb) ->
  setPassword = (password) =>
    @findOne $or: [{ email: data.email }, { lower_username: data.username.toLowerCase() }], domain.intercept (user) =>
      if user
        collision = if data.email is user.email then 'email' else 'username'
        cb error 403, collision+' already exists'
      else
        cmd = $set:
          email: data.email
          password: password
          permission_level: 1
        if data.username
          cmd.$set.username = data.username
          cmd.$set.lower_username = data.username.toLowerCase();
        @findByIdAndUpdate userId, cmd, domain.intercept (user) ->
          cb null, user
  if not configs.passwordSalt then setPassword data.password else
    bcrypt.hash data.password + configs.passwordSalt, 10, (err, hash) ->
      if err then throw err
      setPassword hash

userSchema.statics.publicListWithIds = (domain, userIds, cb) ->
  query = _id: $in: userIds
  @publicList domain, query, cb

userSchema.statics.publicList = (domain, query, cb) ->
  fields =
    username : 1
    name     : 1
    fb_userid: 1
    email    : 1
    created  : 1
    show_email: 1
    company  : 1,
  @find query, fields, domain.intercept (users) ->
    cb null, users.map (user) ->
      user = user.toJSON()
      if !user.show_email then user.email = undefined
      user

userSchema.methods.getVotes = () ->
  votes = [ ]
  for vote in @votes
    json_vote = vote.toJSON()
    json_vote.runnable = encodeId json_vote.runnable
    votes.push json_vote
  votes

userSchema.methods.addVote = (domain, runnableId, cb) ->
  found = false
  for vote in @votes
    if vote.runnable.toString() is runnableId.toString()
      found = true
  if found then cb error 403, 'cannot vote on runnable more than once' else
    @votes.push runnable: runnableId
    @save domain.intercept () =>
      vote = @votes[@votes.length-1].toJSON()
      vote.runnable = encodeId vote.runnable
      cb null, vote

userSchema.methods.removeVote = (domain, voteId, cb) ->
  vote = @votes.id voteId
  if not vote then cb error 404, 'vote not found' else
    vote.remove()
    @save domain.intercept () ->
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
