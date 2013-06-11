configs = require '../configs'
crypto = require 'crypto'
mongoose = require 'mongoose'
volumes = require './volumes'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

commentsSchema = new Schema
  user:
    type: ObjectId
    ref: 'Users'
  text: String

fileSchema = new Schema
  name:
    type: String
  path:
    type: String
  dir:
    type: Boolean
  default:
    type: Boolean
    default: false

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
  image:
    type: String
  created:
    type: Date
    default: Date.now
  framework:
    type: String
  edited:
    type: Boolean
  tags:
    type: [ tagsSchema ]
    default: [ ]
    index: true
  files:
    type: [ fileSchema ]
    default: [ ]
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
      image: configs.images[framework].id
      name: configs.images[framework].name
      framework: framework
    project.save (err) ->
      if err then cb { code: 500, msg: 'error saving project to mongodb' } else
        volumes.create project._id.toString(), (err) ->
          if err then cb err else cb null, project

projectSchema.statics.listTags = (cb) ->
  @find().distinct 'tags', (err, tags) ->
    if err then cb { code: 500, msg: 'error retrieving project tags' } else
      cb null, tags

projectSchema.methods.createFile = (name, path, content, cb) ->
  volumes.createFile @_id, name, path, content, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
      file = @files[@files.length-1]
      @save (err) ->
        if err then { code: 500, msg: 'error saving file meta-data to mongodb' } else
          cb null, { _id: file._id, name: name, path: path }

projectSchema.methods.updateFile = (fileId, content, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file not found' } else
    volumes.updateFile @_id, file.name, file.path, content, (err) ->
      if err then cb err else
        cb null, file

projectSchema.methods.createDirectory = (name, path, cb) ->
  volumes.createDirectory @_id, name, path, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
        dir: true
      file = @files[@files.length-1]
      @save (err) ->
        if err then { code: 500, msg: 'error saving file meta-data to mongodb' } else
          cb null, file

projectSchema.methods.readFile = (fileId, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, message: 'file does not exist' } else
    volumes.readFile @_id, file.name, file.path, (err, content) ->
      if err then cb err else
        cb null, { _id: file._id, name: file.name, path: file.path, content: content }

module.exports = mongoose.model 'Projects', projectSchema