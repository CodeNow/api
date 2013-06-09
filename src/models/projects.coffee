configs = require '../configs'
crypto = require 'crypto'
mongoose = require 'mongoose'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

commentsSchema = new Schema
  user:
    type: ObjectId
    ref: 'Users'
  text: String

tagsSchema = new Schema
  name: String

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
    type: [ String ]
    default: [ ]
  framework:
    type: String
  edited:
    type: Boolean
  tags:
    type: [ tagsSchema ]
    default: [ ]
    index: true
  sortOrder:
    type: Number
    index: true
  comments:
    type: [ commentsSchema ]
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

projectSchema.statics.listTags = (cb) ->
  @find().distinct 'tags', (err, tags) ->
    if err then cb { code: 500, msg: 'error retrieving project tags' } else
      cb null, tags

module.exports = mongoose.model 'Projects', projectSchema