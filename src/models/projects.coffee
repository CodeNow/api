async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
path = require 'path'
mongoose = require 'mongoose'
sa = require 'superagent'

docker = dockerjs host: configs.docker

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
  container:
    type: String
  published:
    type: ObjectId
  image:
    type: String
  parent:
    type: ObjectId
    index: true
  created:
    type: Date
    default: Date.now
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

projectSchema.statics.create = (owner, base, cb) ->
  if not configs.runnables?[base] then cb { code: 403, msg: 'base does not exist' } else
    runnable = configs.runnables[base]
    project = new @
      owner: owner
      name: runnable.name
    for file in runnable.files
      project.files.push
        name: file.name
        default: file.default
        path: file.path
    docker.createContainer
      Hostname: project._id.toString()
      Image: runnable.image
    , (err, result) ->
      if err then cb { code: 500, msg: 'error creating docker container', err: err } else
        project.container = result.Id
        project.save (err) ->
          if err then cb { code: 500, msg: 'error saving project to mongodb' } else
            volumes.create project._id.toString(), (err) ->
              if err then cb err else cb null, project

projectSchema.statics.fork = (owner, parent, cb) ->
  project = new @
    parent: parent._id
    name: parent.name
    framework: parent.framework
    owner: owner
  docker.commit
    queryParams:
      container: parent.container
      m: "#{parent._id} => #{project._id}"
      author: parent.owner.toString()
      run: JSON.stringify
        Cmd: [
          '/bin/sh'
          '-c'
          'cd root; npm start'
        ]
        PortSpecs: "80"
  , (err, res) ->
    if err then cb { code: 500, msg: 'error commiting parent container to image', err: err } else
      project.image = res.Id
      docker.createContainer
        Hostname: project._id.toString()
        Image: res.Id
        Cmd: [
          '/bin/sh'
          '-c'
          'cd root; npm start'
        ]
      , (err, res) ->
        if err then cb { code: 500, msg: 'error creating docker container from image', err: err } else
          project.container = res.Id
          volumes.copy parent._id.toString(), project._id.toString(), (err) ->
            if err then cb err else
              project.files = parent.files
              project.save (err) ->
                if err then cb { code: 500, msg: 'error saving project to mongodb', err: err } else
                  cb null, project

projectSchema.statics.destroy = (id, cb) ->
  @findOne _id: id, (err, project) =>
    if err then cb { code: 500, msg: 'error looking up project in mongodb', err: err } else
      if not project then cb { code: 404, msg: 'project not found' } else
        volumes.remove project._id, (err) =>
          if err then cb { code: 500, msg: 'error removing project volume', err: err } else
            project.containerState (err, state) =>
              if err then cb err else
                remove = () =>
                  docker.removeContainer project.container, (err) =>
                    if err then cb { code: 500, msg: 'error removing container from docker', err: err } else
                      @remove id, (err) ->
                        if err then cb { code: 500, msg: 'error removing project from mongodb', err: err } else
                          cb()
                if state.running
                  project.stop (err) =>
                    if err then cb err else
                      remove()
                else
                  remove()

projectSchema.methods.containerState = (cb) ->
  docker.inspectContainer @container, (err, result) ->
    if err then cb { code: 500, msg: 'error getting container state', err: err } else
      if result.NetworkSettings.PortMapping
        port = result.NetworkSettings.PortMapping['80']
        host = result.NetworkSettings.IpAddress
        cb null,
          running: result.State.Running
          web_url: "http://#{host}:#{port}"
      else
        cb null, { running: result.State.Running }

projectSchema.methods.start = (cb) ->
  docker.startContainer @container, (err) ->
    if err then cb { code: 500, msg: 'error starting docker container', err: err } else
      cb()

projectSchema.methods.stop = (cb) ->
  docker.stopContainer @container, (err) ->
    if err then cb { code: 500, msg: 'error stopping docker container', err: err } else
      cb()

projectSchema.statics.listTags = (cb) ->
  @find().distinct 'tags', (err, tags) ->
    if err then cb { code: 500, msg: 'error retrieving project tags', err: err } else
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
        if err then { code: 500, msg: 'error saving file meta-data to mongodb', err: err } else
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