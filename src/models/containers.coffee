async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
path = require 'path'
mongoose = require 'mongoose'

docker = dockerjs host: configs.docker

volumes = { }
if configs.dnode
  volumes = require './volumes/dnode'
else
  volumes = require './volumes/disk'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

containerSchema = new Schema
  name:
    type: String
  owner:
    type: ObjectId
  docker_id:
    type: String
  parent:
    type: ObjectId
    index: true
  created:
    type: Date
    default: Date.now
  changed:
    type: Boolean
    default: false
  cmd:
    type: String
  tags:
    type: [
      name: String
    ]
    default: [ ]
    index: true
  file_root:
    type: String
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

containerSchema.set 'toJSON', virtuals: true

containerSchema.index
  tags: 1
  parent: 1

containerSchema.statics.create = (owner, image, cb) ->
  if owner is image.owner
    parent = image.parent
  else
    parent = image._id
  container = new @
    parent: parent
    name: image.name
    owner: owner
    cmd: image.cmd
    file_root: image.file_root
  for file in image.files
    container.files.push file.toJSON()
  for tag in image.tags
    container.tags.push tag.toJSON()
  docker.createContainer
    Hostname: container._id.toString()
    Image: image.docker_id
    Cmd: container.cmd
  , (err, res) ->
    if err then cb { code: 500, msg: 'error creating docker container', err: err } else
      container.docker_id = res.Id
      container.save (err) ->
        if err then cb { code: 500, msg: 'error saving container metadata to mongodb' } else
          volumes.create container.docker_id, (err) ->
            if err then cb err else cb null, container

containerSchema.statics.destroy = (id, cb) ->
  @findOne _id: id, (err, container) =>
    if err then cb { code: 500, msg: 'error looking up container metadata in mongodb', err: err } else
      if not container then cb { code: 404, msg: 'container metadata not found' } else
        volumes.remove container.docker_id, (err) =>
          if err then cb { code: 500, msg: 'error removing project volume', err: err } else
            container.getProcessState (err, state) =>
              if err then cb err else
                remove = () =>
                  docker.removeContainer container.docker_id, (err) =>
                    if err then cb { code: 500, msg: 'error removing container from docker', err: err } else
                      @remove id, (err) ->
                        if err then cb { code: 500, msg: 'error removing container metadata from mongodb', err: err } else
                          cb()
                if state.running
                  container.stop (err) =>
                    if err then cb err else
                      remove()
                else
                  remove()

containerSchema.methods.getProcessState = (cb) ->
  docker.inspectContainer @docker_id, (err, result) ->
    if err then cb { code: 500, msg: 'error getting container state', err: err } else
      if result.NetworkSettings.PortMapping
        port = result.NetworkSettings.PortMapping['80']
        host = result.NetworkSettings.IpAddress
        cb null,
          running: result.State.Running
          web_url: "http://#{host}:#{port}"
      else
        cb null, { running: result.State.Running }

containerSchema.methods.start = (cb) ->
  docker.startContainer @docker_id, (err) ->
    if err then cb { code: 500, msg: 'error starting docker container', err: err } else
      cb()

containerSchema.methods.stop = (cb) ->
  docker.stopContainer @docker_id, (err) ->
    if err then cb { code: 500, msg: 'error stopping docker container', err: err } else
      cb()

containerSchema.methods.listFiles = (content, dir, default_tag, path, cb) ->
  if default_tag
    files = [ ]
    async.forEachSeries @files, (file, cb) =>
      if not file.default
        if not path or file.path is path
          files.push file.toJSON()
        cb()
      else
        volumes.readFile @docker_id, file.name, file.path, (err, content) ->
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
          volumes.readFile @docker_id, file.name, file.path, (err, content) ->
            if err then cb err else
              file = file.toJSON()
              file.content = content
              files.push file
              cb()
      , (err) ->
        if err then cb err else
          cb null, files

containerSchema.methods.createFile = (name, path, content, cb) ->
  volumes.createFile @docker_id, name, path, content, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
      file = @files[@files.length-1]
      @save (err) ->
        if err then { code: 500, msg: 'error saving file meta-data to mongodb', err: err } else
          cb null, { _id: file._id, name: name, path: path }

containerSchema.methods.updateFile = (fileId, content, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file not found' } else
    volumes.updateFile @docker_id, file.name, file.path, content, (err) ->
      if err then cb err else
        cb null, file

containerSchema.methods.renameFile = (fileId, newName, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file not found' } else
    volumes.renameFile @docker_id, file.name, file.path, newName, (err) =>
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

containerSchema.methods.moveFile = (fileId, newPath, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file not found' } else
    volumes.moveFile @docker_id, file.name, file.path, newPath, (err) =>
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

containerSchema.methods.createDirectory = (name, path, cb) ->
  volumes.createDirectory @docker_id, name, path, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
        dir: true
      file = @files[@files.length-1]
      @save (err) ->
        if err then { code: 500, msg: 'error saving file meta-data to mongodb' } else
          cb null, file

containerSchema.methods.readFile = (fileId, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file does not exist' } else
    volumes.readFile @docker_id, file.name, file.path, (err, content) ->
      if err then cb err else
        file = file.toJSON()
        file.content = content
        cb null, file

containerSchema.methods.tagFile = (fileId, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, msg: 'file does not exist' } else
    if file.dir then cb { code: 403, msg: 'cannot tag directory as default' } else
      file.default = true
      @save (err) ->
        if err then cb { code: 500, msg: 'error writing to mongodb' } else
         cb null, file

containerSchema.methods.deleteAllFiles = (cb) ->
  volumes.deleteAllFiles @docker_id, (err) =>
    if err then cb err else
      @files = [ ]
      @save (err) ->
        if err then cb { code: 500, msg: 'error removing files from mongodb' } else
          cb()

containerSchema.methods.deleteFile = (fileId, recursive, cb) ->
  file = @files.id fileId
  if not file then cb { code: 404, message: 'file does not exist' } else
    if not file.dir
      if recursive then cb { code: 400, msg: 'cannot recursively delete a plain file'} else
        volumes.deleteFile @docker_id, file.name, file.path, (err) =>
          if err then cb err else
            file.remove()
            @save (err) ->
              if err then cb { code: 500, msg: 'error removing file from mongodb' } else
                cb()
    else
      volumes.removeDirectory @docker_id, file.name, file.path, recursive, (err) =>
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

module.exports = mongoose.model 'Containers', containerSchema