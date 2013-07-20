async = require 'async'
cp = require 'child_process'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
error = require '../error'
fs = require 'fs'
path = require 'path'
mongoose = require 'mongoose'
request = require 'request'
sync = require './sync'
uuid = require 'node-uuid'
_ = require 'lodash'

docker = dockerjs host: configs.docker

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

imageSchema = new Schema
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
  cmd:
    type: String
  port:
    type: Number
  synced:
    type: Boolean
  tags:
    type: [
      name:
        index: true
        sparse: true
        type: String
    ]
    default: [ ]
  service_cmds:
    type: String
    default: ''
  start_cmd:
    type: String
    default: 'date'
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
      default:
        type: Boolean
        default: false
      content:
        type: String
      ignore:
        type: Boolean
    ]
    default: [ ]

imageSchema.set 'toJSON', virtuals: true

imageSchema.index
  tags: 1
  parent: 1

buildDockerImage = (fspath, tag, cb) ->
  child = cp.spawn 'tar', [ '-c', '--directory', fspath, '.' ]
  req = request.post
    url: "#{configs.docker}/v1.3/build"
    headers: { 'content-type': 'application/tar' }
    qs:
      t: tag
  , (err, res, body) ->
    if err then throw err
    if res.statusCode isnt 200 then cb error res.status, body else
      if body.indexOf('Successfully built') is -1 then cb error 400, 'could not build image from dockerfile' else
        cb null, tag
  child.stdout.pipe req

syncDockerImage = (image, cb) ->
  token = uuid.v4()
  docker.createContainer
    Token: token
    Env: [
      "RUNNABLE_USER_DIR=#{image.file_root}"
      "RUNNABLE_SERVICE_CMDS=#{image.service_cmds}"
      "RUNNABLE_START_CMD=#{image.start_cmd}"
    ]
    Hostname: image._id.toString()
    Image: image.docker_id.toString()
    PortSpecs: [ image.port.toString() ]
    Cmd: [ image.cmd ]
  , (err, res) ->
    if err then throw err
    containerId = res.Id
    docker.inspectContainer containerId, (err, result) ->
      if err then throw err
      long_docker_id = result.ID
      sync long_docker_id, image, (err) ->
        if err then cb err else
          docker.removeContainer containerId, (err) ->
            if err then throw err
            cb()

imageSchema.statics.createFromDisk = (owner, name, sync, cb) ->
  runnablePath = "#{__dirname}/../../configs/runnables"
  fs.exists "#{runnablePath}/runnable.json", (err, exists) ->
    if err then throw err else
      if not exists then cb error 403, 'could not find runnable.json' else
        try
          runnable = require "#{runnablePath}/#{name}/runnable.json"
        catch err2
          cb error 403, 'could not parse runnable.json'
        if not runnable then cb new error 400, "image source not found: #{name}" else
          image = new @()
          tag = image._id.toString()
          buildDockerImage "#{runnablePath}/#{name}", tag, (err, docker_id) ->
            if err then cb err else
              image.docker_id = docker_id
              image.owner = owner
              image.name = runnable.name
              image.cmd = runnable.cmd
              if runnable.file_root then image.file_root = runnable.file_root
              if runnable.service_cmds then image.service_cmds = runnable.service_cmds
              if runnable.start_cmd then image.start_cmd = runnable.start_cmd
              image.port = runnable.port
              for tag in runnable.tags
                image.tags.push tag
              for file in runnable.files
                image.files.push file
              if sync
                syncDockerImage image, (err) ->
                  if err then cb err else
                    image.synced = true
                    image.save (err) ->
                      if err then throw err
                      cb null, image
              else
                image.save (err) ->
                  if err then throw err
                  cb null, image

imageSchema.statics.createFromContainer = (container, cb) ->
  image = new @
    parent: container.parent
    owner: container.owner
    name: container.name
    cmd: container.cmd
    file_root: container.file_root
    service_cmds: container.service_cmds
    start_cmd: container.start_cmd
    port: container.port
  for file in container.files
    image.files.push file.toJSON()
  for tag in container.tags
    image.tags.push tag.toJSON()
  docker.commit
    queryParams:
      container: container.docker_id
      m: "#{container.parent} => #{image._id}"
      author: image.owner.toString()
  , (err, result) ->
    if err then throw err
    image.docker_id = result.Id
    image.save (err) ->
      if err then throw err
      cb null, image

imageSchema.methods.updateFromContainer = (container, cb) ->
  @name = container.name
  @cmd = container.cmd
  @file_root = container.file_root
  @service_cmds = container.service_cmds
  @start_cmd = container.start_cmd
  @port = container.port
  @files = [ ]
  for file in container.files
    @files.push file.toJSON()
  @tags = [ ]
  for tag in container.tags
    @tags.push tag.toJSON()
  docker.commit
    queryParams:
      container: container.docker_id
      m: "#{container.parent} => #{@_id}"
      author: @owner.toString()
  , (err, result) =>
    @docker_id = result.Id
    @save (err) =>
      if err then throw err
      cb null, @

imageSchema.statics.destroy = (id, cb) ->
  @findOne _id: id, (err, image) =>
    if err then throw err
    if not image then cb error 404, 'image not found' else
      req = docker.removeImage { id: image.docker_id }
      req.on 'end', () =>
        @remove id, (err) ->
          if err then throw err

imageSchema.statics.listTags = (cb) ->
  @find().distinct 'tags.name', (err, tagNames) ->
    if err then throw err
    cb null, tagNames

imageSchema.statics.isOwner = (userId, runnableId, cb) ->
  @findOne _id: runnableId, (err, image) ->
    if err then throw err
    if not image then cb error 404, 'runnable not found' else
      cb null, image.owner.toString() is userId.toString()

imageSchema.methods.sync = (cb) ->
  if @synced then cb() else
    syncDockerImage @, (err) =>
      if err then cb err else
        @synced = true
        @save (err) ->
          if err then throw err
          cb()

module.exports = mongoose.model 'Images', imageSchema
