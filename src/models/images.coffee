async = require 'async'
cp = require 'child_process'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
domain = require 'domain'
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
  port:
    type: Number
  synced:
    type: Boolean
  tags:
    type: [
      channel:
        type: ObjectId
        index:
          sparse: true
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
  specification:
    type: ObjectId

imageSchema.set 'toJSON', virtuals: true

imageSchema.index
  tags: 1
  parent: 1

buildDockerImage = (domain, fspath, tag, cb) ->
  child = cp.spawn 'tar', [ '-c', '--directory', fspath, '.' ]
  req = request.post
    url: "#{configs.docker}/v1.3/build"
    headers: { 'content-type': 'application/tar' }
    qs:
      t: tag
  , domain.intercept (res, body) ->
    if res.statusCode isnt 200 then cb error res.status, body else
      if body.indexOf('Successfully built') is -1 then cb error 400, 'could not build image from dockerfile' else
        cb null, tag
  child.stdout.pipe req

syncDockerImage = (domain, image, cb) ->
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
  , domain.intercept (res) ->
    containerId = res.Id
    docker.inspectContainer containerId, domain.intercept (result) ->
      long_docker_id = result.ID
      sync long_docker_id, image, (err) ->
        if err then cb err else
          docker.removeContainer containerId, domain.intercept () ->
            cb()

imageSchema.statics.createFromDisk = (domain, owner, name, sync, cb) ->
  runnablePath = "#{__dirname}/../../configs/runnables"
  fs.exists "#{runnablePath}/#{name}/runnable.json", (exists) =>
    if not exists then cb error 400, "image source not found: #{name}" else
      runnable = require "#{runnablePath}/#{name}/runnable.json"
      if not runnable then cb error 400, "image source not found: #{name}" else
        @findOne name: name, domain.intercept (existing) =>
          if existing then cb error 403, 'a shared runnable by that name already exists' else
            image = new @()
            tag = image._id.toString()
            buildDockerImage domain, "#{runnablePath}/#{name}", tag, (err, docker_id) ->
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
                  syncDockerImage domain, image, (err) ->
                    if err then throw err
                    image.synced = true
                    image.save domain.intercept () ->
                      cb null, image
                else
                  image.save domain.intercept () ->
                    cb null, image

imageSchema.statics.createFromContainer = (domain, container, cb) ->
  @findOne name: container.name, domain.intercept (existing) =>
    if existing then cb error 403, 'a shared runnable by that name already exists' else
      image = new @
        parent: container.parent
        owner: container.owner
        name: container.name
        cmd: container.cmd
        file_root: container.file_root
        service_cmds: container.service_cmds
        start_cmd: container.start_cmd
        port: container.port
        synced: true
        specification: container.specification
      for file in container.files
        image.files.push file.toJSON()
      for tag in container.tags
        image.tags.push tag.toJSON()
      docker.commit
        queryParams:
          container: container.docker_id
          m: "#{container.parent} => #{image._id}"
          author: image.owner.toString()
      , domain.intercept (result) ->
        image.docker_id = result.Id
        image.save domain.intercept () ->
          cb null, image

imageSchema.methods.updateFromContainer = (domain, container, cb) ->
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
  , domain.intercept (result) =>
    @docker_id = result.Id
    @save domain.intercept () =>
      cb null, @

imageSchema.statics.destroy = (domain, id, cb) ->
  @findOne _id: id, domain.intercept (image) =>
    if not image then cb error 404, 'image not found' else
      @remove { _id: id }, domain.intercept () ->
        cb()

imageSchema.statics.listTags = (domain, cb) ->
  @find().distinct 'tags.name', domain.intercept (tagNames) ->
    cb null, tagNames

imageSchema.statics.relatedChannelIds = (domain, channelIds, cb) ->
  @distinct 'tags.channel', 'tags.channel':$in:channelIds, domain.intercept (channelIds) ->
    cb null, channelIds

imageSchema.statics.isOwner = (domain, userId, runnableId, cb) ->
  @findOne _id: runnableId, domain.intercept (image) ->
    if not image then cb error 404, 'runnable not found' else
      cb null, image.owner.toString() is userId.toString()

imageSchema.methods.sync = (domain, cb) ->
  if @synced then cb() else
    syncDockerImage domain, @, (err) =>
      if err then throw err
      @synced = true
      @save domain.intercept () ->
        cb()

module.exports = mongoose.model 'Images', imageSchema
module.exports.docker = docker
