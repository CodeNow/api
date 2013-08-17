async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
error = require '../error'
path = require 'path'
mongoose = require 'mongoose'
sync = require './sync'
uuid = require 'node-uuid'
volumes = require  "./volumes"
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
      channel: ObjectId
    ]
    default: [ ]
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

containerSchema.statics.create = (domain, owner, image, cb) ->
  image.sync domain, () =>
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
    , domain.intercept (res) ->
      container.docker_id = res.Id
      docker.inspectContainer container.docker_id, domain.intercept (result) ->
        container.long_docker_id = result.ID
        container.save domain.intercept () ->
          cb null, container

containerSchema.statics.destroy = (domain, id, cb) ->
  @findOne { _id: id } , domain.intercept (container) =>
    if not container then cb error 404, 'container metadata not found' else
      container.getProcessState domain, (err, state) =>
        if err then cb err else
          remove = () =>
            docker.removeContainer container.docker_id, domain.intercept () =>
              @remove { _id: id }, domain.intercept () ->
                cb()
          if state.running
            container.stop domain, (err) =>
              if err then cb err else
                remove()
          else
            remove()

containerSchema.methods.getProcessState = (domain, cb) ->
  docker.inspectContainer @docker_id, domain.intercept (result) ->
    if not result.State?
      throw new Error 'bad result from docker.inspectContainer'
    cb null, running: result.State.Running

containerSchema.methods.start = (domain, cb) ->
  docker.startContainer @docker_id, domain.intercept () ->
    cb()

containerSchema.methods.stop = (domain, cb) ->
  docker.stopContainer @docker_id, domain.intercept () ->
    cb()

containerSchema.methods.listFiles = (domain, content, dir, default_tag, path, cb) ->
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

containerSchema.methods.syncFiles = (domain, cb) ->
  sync @long_docker_id, @, (err) =>
    if err then cb err else
      @last_write = new Date()
      @save domain.intercept () =>
        cb null, @

containerSchema.methods.createFile = (domain, name, path, content, cb) ->
  volumes.createFile @long_docker_id, @file_root, name, path, content, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
        content: content
      file = @files[@files.length-1]
      @last_write = new Date()
      @save domain.intercept () ->
        cb null, { _id: file._id, name: name, path: path }

containerSchema.methods.updateFile = (domain, fileId, content, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    volumes.updateFile @long_docker_id, @file_root, file.name, file.path, content, (err) =>
      if err then cb err else
        file.content = content
        @last_write = new Date()
        @save domain.intercept () ->
          cb null, file

containerSchema.methods.renameFile = (domain, fileId, newName, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
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
        @save domain.intercept () ->
          cb null, file

containerSchema.methods.moveFile = (domain, fileId, newPath, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
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
        @save domain.intercept () ->
          cb null, file

containerSchema.methods.createDirectory = (domain, name, path, cb) ->
  volumes.createDirectory @long_docker_id, @file_root, name, path, (err) =>
    if err then cb err else
      @files.push
        path: path
        name: name
        dir: true
      file = @files[@files.length-1]
      @last_write = new Date()
      @save domain.intercept () ->
        cb null, file

containerSchema.methods.readFile = (domain, fileId, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    cb null, file.toJSON()

containerSchema.methods.tagFile = (domain, fileId, isDefault, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    if file.dir then cb error 403, 'cannot tag directory as default' else
      file.default = isDefault
      @save domain.intercept () ->
        cb null, file

containerSchema.methods.deleteAllFiles = (domain, cb) ->
  volumes.deleteAllFiles @long_docker_id, @file_root, (err) =>
    if err then cb err else
      @files = [ ]
      @last_write = new Date()
      @save domain.intercept () ->
        cb()

containerSchema.methods.deleteFile = (domain, fileId, recursive, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    if not file.dir
      if recursive then cb error 400, 'cannot recursively delete a plain file' else
        volumes.deleteFile @long_docker_id, @file_root, file.name, file.path, (err) =>
          if err then cb err else
            file.remove()
            @last_write = new Date()
            @save domain.intercept () ->
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
          @save domain.intercept () ->
            cb()

containerSchema.methods.getMountedFiles = (domain, fileId, mountDir, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    if not file.ignore then cb error 403, 'entry is not a valid mount point' else
      subDir = path.normalize "#{file.path}/#{file.name}/#{mountDir}"
      volumes.readDirectory @long_docker_id, @file_root, subDir, (err, files) ->
        if err then cb 403, 'entry is not mounted' else
          cb null, files

module.exports = mongoose.model 'Containers', containerSchema
module.exports.docker = docker
