configs = require '../configs'
crypto = require 'crypto'
mongoose = require 'mongoose'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

commentsSchema = new Schema
  name: String
  text: String
  email: String

commentsSchema.set 'toJSON', virtuals: true
commentsSchema.virtual('email_md5').get () ->
  if not @email then null else
    hash = crypto.createHash 'md5'
    hash.update @email
    hash.digest 'hex'

projectSchema = new Schema
  name:
    type: String
  owner:
    type: ObjectId
    index: true
  parent:
    type: ObjectId
    index: true
  rootParent:
    type: ObjectId
  created:
    type: Date
    default: Date.now
  defaultFile:
    type: [String]
    default: [ ]
  framework:
    type: String
  edited:
    type: Boolean
  tags:
    type: [String]
    default: [ ]
    index: true
  sortOrder:
    type: Number
    index: true
  comments:
    type: [commentsSchema]
    default: [ ]

projectSchema.set 'toJSON', virtuals: true
projectSchema.index
  tags: 1
  parent: 1
projectSchema.index
  owner: 1
  name: 1

projectSchema.statics.create = (owner, framework, cb) ->

  if not configs.images?[framework] then cb { code: 403, msg: 'framework does not exist' } else
    project = new @
      owner: owner
      id: configs.images[framework].id
      name: configs.images[framework].name
      defaultFile: configs.images[framework].files
      framework: framework
    project.save (err) ->
      if err then cb { code: 500, msg: 'error saving project to mongodb' } else
        cb null, project

module.exports = mongoose.model 'Projects', projectSchema