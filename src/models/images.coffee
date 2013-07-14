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
volumes = require "./volumes/#{configs.volume}"

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
  tags:
    type: [
      name:
        type: String
        index: true
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
    ]
    default: [ ]

imageSchema.set 'toJSON', virtuals: true

imageSchema.index
  tags: 1
  parent: 1

imageSchema.statics.createFromDisk = (owner, name, cb) ->
  runnablePath = "#{__dirname}/../../configs/runnables"
  runnable = require "#{runnablePath}/#{name}/runnable.json"
  if not runnable then cb new error { code: 500, msg: 'could not load image from disk' } else
    image = new @
      owner: owner
      name: runnable.name
      cmd: runnable.cmd
      file_root: runnable.file_root
      port: runnable.port
    for file in runnable.files
      image.files.push file
    for tag in runnable.tags
      image.tags.push tag
    child = cp.spawn 'tar', [ '-c', '--directory', "#{runnablePath}/#{name}", '.' ]
    req = request.post
      timeout: 60000
      url: "#{configs.docker}/v1.3/build"
      headers:
        'content-type': 'application/tar'
      qs:
        t: image._id.toString()
    , (err, res, body) ->
        if err then cb new error { code: 500, msg: 'error building image from Dockerfile' } else
          if res.statusCode isnt 200 then cb new error { code: res.status, msg: body } else
            if body.indexOf('Successfully built') is -1 then cb new error { code: 500, msg: 'could not build image from dockerfile' } else
              image.docker_id = image._id.toString()
              image.save (err) ->
                if err then new error { code: 500, msg: 'error saving image to mongodb' } else
                  volumes.create image._id, image.file_root, (err) ->
                    if err then cb err else
                      async.map runnable.files, (file, cb) ->
                        fs.readFile "#{runnablePath}/#{name}/#{file.content}", 'base64', (err, content) ->
                          if err then cb new error { code: 500, msg: 'error reading source file for building image' } else
                            cb null,
                              name: file.name
                              path: file.path
                              default: file.default
                              content: content
                      , (err, files) ->
                        if err then cb err else
                          volumes.createFiles image._id, image.file_root, files, (err) ->
                            if err then cb new error { code: 500, msg: 'error writing source files to disk' } else
                              cb null, image
    child.stdout.pipe req

imageSchema.statics.create = (container, cb) ->
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
          volumes.copy container.long_docker_id, image._id, image.file_root, (err) ->
            if err then cb err else
              cb null, image

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

imageSchema.methods.updateFromContainer = (container, cb) ->
  @owner = container.owner
  @name = container.name
  @parent = container.parent
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

module.exports = mongoose.model 'Images', imageSchema