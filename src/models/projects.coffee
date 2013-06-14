async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
path = require 'path'
mongoose = require 'mongoose'

volumes = { }
if configs.dnode
  volumes = require './volumes/dnode'
else
  volumes = require './volumes/disk'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

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
    type: [
      name: String
    ]
    default: [ ]
    index: true
  files:
    type: [
      name:
        type: String
      path:
        type: String
      dir:
        type: Boolean
      default:
        type: Boolean
        default: false
    ]
    default: [ ]
  sortOrder:
    type: Number
    index: true
  comments:
    type: [
      user:
        type: ObjectId
        ref: 'Users'
      text: String
    ]
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

projectSchema.methods.listFiles = (content, dir, default_tag, path, cb) ->
  if default_tag
    files = [ ]
    async.forEachSeries @files, (file, cb) =>
      if not file.default
        if not path or file.path is path
          files.push file.toJSON()
        cb()
      else
        volumes.readFile @_id, file.name, file.path, (err, content) ->
          if err then cb err else
            if not path or file.path is path
              file = file.toJSON()
              file.content = content
              files.push file
            cb()
    , (err) ->
      if err then cb err else
        cb null, files
  else
    if not content
      if dir
        if path
          cb null, (file.toJSON() for file in @files when file.dir and file.path is path)
        else
          cb null, (file.toJSON() for file in @files when file.dir)
      else
        if path
          cb null, (file.toJSON() for file in @files when file.path is path)
        else
          cb null, (file.toJSON() for file in @files)
    else
      files = [ ]
      async.forEachSeries @files, (file, cb) =>
        if path and file.path isnt path then cb() else
          volumes.readFile @_id, file.name, file.path, (err, content) ->
            if err then cb err else
              file = file.toJSON()
              file.content = content
              files.push file
              cb()
      , (err) ->
        if err then cb err else
          cb null, files

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

projectSchema.methods.renameFile = (fileId, newName, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file not found' } else
    volumes.renameFile @_id, file.name, file.path, newName, (err) =>
      if err then cb err else
        oldName = file.name
        file.name = newName
        if file.dir
          oldPath = path.normalize "#{file.path}/#{oldName}"
          newPath = path.normalize "#{file.path}/#{newName}"
          for elem in @files
            if elem.path.indexOf(oldPath) is 0 and elem._id isnt file._id
              elem.path = elem.path.replace oldPath, newPath
        @save (err) ->
          if err then cb { code: 500, msg: 'error updating filename in mongodb' } else
            cb null, file

projectSchema.methods.moveFile = (fileId, newPath, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file not found' } else
    volumes.moveFile @_id, file.name, file.path, newPath, (err) =>
      if err then cb err else
        oldPath = file.path
        file.path = newPath
        if file.dir
          oldPath = path.normalize "#{oldPath}/#{file.name}"
          newPath = path.normalize "#{newPath}/#{file.name}"
          for elem in @files
            if elem.path.indexOf(oldPath) is 0 and elem._id isnt file._id
              elem.path = elem.path.replace oldPath, newPath
        @save (err) ->
          if err then cb { code: 500, msg: 'error updating filename in mongodb' } else
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
  if not file then cb { code: 404, msg: 'file does not exist' } else
    volumes.readFile @_id, file.name, file.path, (err, content) ->
      if err then cb err else
        file = file.toJSON()
        file.content = content
        cb null, file

projectSchema.methods.tagFile = (fileId, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file does not exist' } else
    if file.dir then cb { code: 403, msg: 'cannot tag directory as default' } else
      file.default = true
      @save (err) ->
        if err then cb { code: 500, msg: 'error writing to mongodb' } else
         cb null, file

projectSchema.methods.deleteAllFiles = (cb) ->
  volumes.deleteAllFiles @_id, (err) =>
    if err then cb err else
      @files = [ ]
      @save (err) ->
        if err then cb { code: 500, msg: 'error removing files from mongodb' } else
          cb()

projectSchema.methods.deleteFile = (fileId, recursive, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, message: 'file does not exist' } else
    if not file.dir
      if recursive then cb { code: 400, msg: 'cannot recursively delete a plain file'} else
        volumes.deleteFile @_id, file.name, file.path, (err) =>
          if err then cb err else
            file.remove()
            @save (err) ->
              if err then cb { code: 500, msg: 'error removing file from mongodb' } else
                cb()
    else
      volumes.removeDirectory @_id, file.name, file.path, recursive, (err) =>
        if err then cb err else
          if recursive
            toDelete = [ ]
            match = path.normalize "#{file.path}/#{file.name}"
            for elem in @files
              if elem.path.indexOf(match) is 0
                toDelete.push elem
            for elem in toDelete
              elem.remove()
          file.remove()
          @save (err) ->
            if err then cb { code: 500, msg: 'error removing file from mongodb' } else
              cb()

module.exports = mongoose.model 'Projects', projectSchema