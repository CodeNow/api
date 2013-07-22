async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
error = require '../error'
path = require 'path'
mongoose = require 'mongoose'
sync = require './sync'
uuid = require 'node-uuid'
volumes = require  "./volumes/#{configs.volume}"
_ = require 'lodash'

docker = dockerjs host: configs.docker

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

containerSchema = new Schema
  name:
    type: String
  owner:
    type: ObjectId
  docker_id:
    type: String
  long_docker_id:
    type: String
  parent:
    type: ObjectId
    index: true
  created:
    type: Date
    default: Date.now
  target:
    type: ObjectId
  cmd:
    type: String
  port:
    type: Number
  token:
    type: String
  tags:
    type: [
      name: String
    ]
    default: [ ]
    index: true
  service_cmds:
    type: String
    default: ''
  start_cmd:
    type: String
    default: 'date'
  last_write:
    type: Date
  file_root:
    type: String
    default: '/root'
  files:
    type: [
      name:
        type: String
      path:
        type: String
      dir:
        type: Boolean
      ignore:
        type: Boolean
      content:
        type: String
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
  if not image.docker_id then cb new error { code: 500, msg: 'image must have docker_id to create container from' } else
    image.sync (err) =>
      if err then cb { code: 500, msg: 'error syncing image from disk' } else
        container = new @
          parent: image
          name: image.name
          owner: owner
          port: image.port
          cmd: image.cmd
          file_root: image.file_root
          service_cmds: image.service_cmds
          start_cmd: image.start_cmd
          token: uuid.v4()
        for file in image.files
          container.files.push file.toJSON()
        for tag in image.tags
          container.tags.push tag.toJSON()
        docker.createContainer
          Token: container.token
          Env: [
            "RUNNABLE_USER_DIR=#{container.file_root}"
            "RUNNABLE_SERVICE_CMDS=#{container.service_cmds}"
            "RUNNABLE_START_CMD=#{container.start_cmd}"
          ]
          Hostname: 'runnable'
          Image: image.docker_id.toString()
          PortSpecs: [ container.port.toString() ]
          Cmd: [ container.cmd ]
        , (err, res) ->
          if err then cb new error { code: 500, msg: 'error creating docker container' } else
            container.docker_id = res.Id
            docker.inspectContainer container.docker_id, (err, result) ->
              if err then cb new error { code: 500, msg: 'error getting container state' } else
                container.long_docker_id = result.ID
                container.save (err) ->
                  if err then cb new error { code: 500, msg: 'error saving container metadata to mongodb' } else
                    cb null, container

containerSchema.statics.destroy = (id, cb) ->
  @findOne { _id: id } , (err, container) =>
    if err then cb new error { code: 500, msg: 'error looking up container metadata in mongodb' } else
      if not container then cb new error { code: 404, msg: 'container metadata not found' } else
        container.getProcessState (err, state) =>
          if err then cb err else
            remove = () =>
              docker.removeContainer container.docker_id, (err) =>
                if err then cb new error { code: 500, msg: 'error removing container from docker' } else
                  @remove { _id: id }, (err) ->
                    if err then cb new error { code: 500, msg: 'error removing container metadata from mongodb' } else
                      cb()
            if state.running
              container.stop (err) =>
                if err then cb err else
                  remove()
            else
              remove()

containerSchema.methods.getProcessState = (cb) ->
  docker.inspectContainer @docker_id, (err, result) ->
    if err then cb new error { code: 500, msg: 'error getting container state' } else
      cb null, running: result.State.Running

containerSchema.methods.start = (cb) ->
  docker.startContainer
    id: @docker_id
    Binds: [
      "#{configs.volumesPath}/#{@long_docker_id}:#{@file_root}"
    ], (err, res) ->
      if err then cb new error { code: 500, msg: 'error starting docker container' } else
        cb()

containerSchema.methods.stop = (cb) ->
  docker.stopContainer @docker_id, (err) ->
    if err then cb new error { code: 500, msg: 'error stopping docker container' } else
      cb()

containerSchema.methods.listFiles = (content, dir, default_tag, path, cb) ->
  files = [ ]
  if default_tag
    content = true
    @files.forEach (file) ->
      if file.default
        if not path or file.path is path
          files.push file.toJSON()
  else if dir
    @files.forEach (file) ->
      if file.dir
        if not path or file.path is path
          files.push file.toJSON()
  else
    @files.forEach (file) ->
      if not path or file.path is path
        files.push file.toJSON()
  if not content
    files.forEach (file) ->
      delete file.content
  cb null, files

containerSchema.methods.syncFiles = (cb) ->
  sync @long_docker_id, @, (err) =>
    if err then cb err else
      @last_write = new Date()
      @save (err) =>
        if err then new error { code: 500, msg: 'error saving container to mongodb' } else
          cb null, @

containerSchema.methods.createFile = (name, path, content, cb) ->
  volumes.createFile @long_docker_id, @file_root, name, path, content, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
        content: content
      file = @files[@files.length-1]
      @last_write = new Date()
      @save (err) ->
        if err then cb new error { code: 500, msg: 'error saving file to mongodb' } else
          cb null, { _id: file._id, name: name, path: path }

containerSchema.methods.updateFile = (fileId, content, cb) ->
  file = @files.id fileId
  if not file then cb new error { code: 404, msg: 'file not found' } else
    volumes.updateFile @long_docker_id, @file_root, file.name, file.path, content, (err) =>
      if err then cb err else
        file.content = content
        @last_write = new Date()
        @save (err) ->
          if err then cb new error { code: 500, msg: 'error saving file to mongodb' } else
            cb null, file

containerSchema.methods.renameFile = (fileId, newName, cb) ->
  file = @files.id fileId
  if not file then cb new error { code: 404, msg: 'file not found' } else
    volumes.renameFile @long_docker_id, @file_root, file.name, file.path, newName, (err) =>
      if err then cb err else
        oldName = file.name
        file.name = newName
        if file.dir
          oldPath = path.normalize "#{file.path}/#{oldName}"
          newPath = path.normalize "#{file.path}/#{newName}"
          for elem in @files
            if elem.path.indexOf(oldPath) is 0 and elem._id isnt file._id
              elem.path = elem.path.replace oldPath, newPath
        @last_write = new Date()
        @save (err) ->
          if err then cb new error { code: 500, msg: 'error updating filename in mongodb' } else
            cb null, file

containerSchema.methods.moveFile = (fileId, newPath, cb) ->
  file = @files.id fileId
  if not file then cb new error { code: 404, msg: 'file not found' } else
    volumes.moveFile @long_docker_id, @file_root, file.name, file.path, newPath, (err) =>
      if err then cb err else
        oldPath = file.path
        file.path = newPath
        if file.dir
          oldPath = path.normalize "#{oldPath}/#{file.name}"
          newPath = path.normalize "#{newPath}/#{file.name}"
          for elem in @files
            if elem.path.indexOf(oldPath) is 0 and elem._id isnt file._id
              elem.path = elem.path.replace oldPath, newPath
        @last_write = new Date()
        @save (err) ->
          if err then cb new error { code: 500, msg: 'error updating filename in mongodb' } else
            cb null, file

containerSchema.methods.createDirectory = (name, path, cb) ->
  volumes.createDirectory @long_docker_id, @file_root, name, path, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
        dir: true
      file = @files[@files.length-1]
      @last_write = new Date()
      @save (err) ->
        if err then cb new error { code: 500, msg: 'error saving file meta-data to mongodb' } else
          cb null, file

containerSchema.methods.readFile = (fileId, cb) ->
  file = @files.id fileId
  if not file then cb new error { code: 404, msg: 'file does not exist' } else
    cb null, file.toJSON()

containerSchema.methods.tagFile = (fileId, cb) ->
  file = @files.id fileId
  if not file then cb new error { code: 404, msg: 'file does not exist' } else
    if file.dir then cb new error { code: 403, msg: 'cannot tag directory as default' } else
      file.default = true
      @save (err) ->
        if err then cb new error { code: 500, msg: 'error writing to mongodb' } else
         cb null, file

containerSchema.methods.deleteAllFiles = (cb) ->
  volumes.deleteAllFiles @long_docker_id, @file_root, (err) =>
    if err then cb err else
      @files = [ ]
      @last_write = new Date()
      @save (err) ->
        if err then cb new error { code: 500, msg: 'error removing files from mongodb' } else
          cb()

containerSchema.methods.deleteFile = (fileId, recursive, cb) ->
  file = @files.id fileId
  if not file then cb new error { code: 404, message: 'file does not exist' } else
    if not file.dir
      if recursive then cb new error { code: 400, msg: 'cannot recursively delete a plain file'} else
        volumes.deleteFile @long_docker_id, @file_root, file.name, file.path, (err) =>
          if err then cb err else
            file.remove()
            @last_write = new Date()
            @save (err) ->
              if err then cb new error { code: 500, msg: 'error removing file from mongodb' } else
                cb()
    else
      volumes.removeDirectory @long_docker_id, @file_root, file.name, file.path, recursive, (err) =>
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
          @last_write = new Date()
          @save (err) ->
            if err then cb new error { code: 500, msg: 'error removing file from mongodb' } else
              cb()

module.exports = mongoose.model 'Containers', containerSchema
