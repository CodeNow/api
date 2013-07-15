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
uuid = require 'node-uuid'
volumes = require "./volumes/#{configs.volume}"
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
        type: String
    ]
    default: [ ]
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
      if err then cb new error { code: 500, msg: 'error building image from Dockerfile' } else
        if res.statusCode isnt 200 then cb new error { code: res.status, msg: body } else
          if body.indexOf('Successfully built') is -1 then cb new error { code: 500, msg: 'could not build image from dockerfile' } else
            cb null, tag
  child.stdout.pipe req

syncDockerImage = (image, cb) ->
  token = uuid.v4()
  docker.createContainer
    Token: token
    Hostname: image._id.toString()
    Image: image.docker_id.toString()
    PortSpecs: [ image.port.toString() ]
    Cmd: [ image.cmd ]
  , (err, res) ->
    if err then cb new error { code: 500, msg: 'error creating container to sync files from' } else
      containerId = res.Id
      docker.inspectContainer containerId, (err, result) ->
        if err then cb new error { code: 500, msg: 'error getting long container id to sync files from' } else
          long_docker_id = result.ID
          ignores = [ ]
          ignored_files = [ ]
          for file in image.files
            if file.ignore
              ignores.push path.normalize "#{file.path}/#{file.name}"
              ignored_files.push file
          volumes.readAllFiles long_docker_id, image.file_root, ignores, (err, allFiles) ->
            if err then cb new error { code: 500, msg: 'error returning list of files from container' } else
              old_file_list = _.clone image.files
              image.files = ignored_files
              allFiles.forEach (file) ->
                found = false
                for existingFile in old_file_list
                  if file.path is existingFile.path and file.name is existingFile.name
                    found = true
                    if file.dir
                      image.files.push
                        _id: existingFile._id
                        name: file.name
                        path: file.path
                        dir: true
                    else
                      image.files.push
                        _id: existingFile._id
                        name: file.name
                        path: file.path
                        content: file.content
                if not found
                  if file.dir
                    image.files.push
                      name: file.name
                      path: file.path
                      dir: true
                  else
                    image.files.push
                      name: file.name
                      path: file.path
                      content: file.content
              docker.removeContainer containerId, (err) ->
                if err then cb new error { code: 500, msg: 'error removing container files were synced from' } else
                  cb()

imageSchema.statics.createFromDisk = (owner, name, sync, cb) ->
  runnablePath = "#{__dirname}/../../configs/runnables"
  try
    runnable = require "#{runnablePath}/#{name}/runnable.json"
  catch err
    cb new error { code: 500, msg: "could not load image #{name} from disk" }
  if not runnable then cb new error { code: 500, msg: 'could not load image from disk' } else
    image = new @()
    tag = image._id.toString()
    buildDockerImage "#{runnablePath}/#{name}", tag, (err, docker_id) ->
      if err then cb err else
        image.docker_id = docker_id
        image.owner = owner
        image.name = runnable.name
        image.cmd = runnable.cmd
        image.file_root = runnable.file_root
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
                if err then new error { code: 500, msg: 'error saving image to mongodb' } else
                  cb null, image
        else
          image.save (err) ->
            if err then new error { code: 500, msg: 'error saving image to mongodb' } else
              cb null, image

imageSchema.statics.createFromContainer = (container, cb) ->
  image = new @
    owner: container.owner
    name: container.name
    parent: container.parent
    cmd: container.cmd
    file_root: container.file_root
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
    if err then cb new error { code: 500, msg: 'error creating docker image' } else
      image.docker_id = result.Id
      image.save (err) ->
        if err then cb new error { code: 500, msg: 'error saving image metadata to mongodb' } else
          cb null, image

imageSchema.methods.updateFromContainer = (container, cb) ->
  @name = container.name
  @cmd = container.cmd
  @file_root = container.file_root
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
    if err then cb new error { code: 500, msg: 'error creating docker image' } else
      @docker_id = result.Id
      @save (err) =>
        if err then cb new error { code: 500, msg: 'error saving image metadata to mongodb' } else
          cb null, @

imageSchema.statics.destroy = (id, cb) ->
  @findOne _id: id, (err, image) =>
    if err then cb new error { code: 500, msg: 'error looking up image in mongodb' } else
      if not image then cb new error { code: 404, msg: 'image not found' } else
        req = docker.removeImage { id: image.docker_id }
        req.on 'error', (err) ->
          cb new error { code: 500, msg: 'error removing docker image' }
        req.on 'end', () =>
          @remove id, (err) ->
            if err then cb new error { code: 500, msg: 'error removing image metadata from mongodb' } else
              cb()

imageSchema.statics.listTags = (cb) ->
  @find().distinct 'tags.name', (err, tagNames) ->
    if err then cb new error { code: 500, msg: 'error retrieving project tags', err: err } else
      tags = tagNames.map (tag) ->
        name: tag, _id: tag
      cb null, tags

imageSchema.statics.isOwner = (userId, runnableId, cb) ->
  @findOne _id: runnableId, (err, image) ->
    if err then cb new error { code: 500, msg: 'error looking up runnable' } else
      if not image then cb new error { code: 404, msg: 'runnable not found' } else
        cb null, image.owner.toString() is userId.toString()

imageSchema.methods.sync = (cb) ->
  if @synced then cb() else
    syncDockerImage @, (err) =>
      if err then cb err else
        @synced = true
        @save cb

module.exports = mongoose.model 'Images', imageSchema