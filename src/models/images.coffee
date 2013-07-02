async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
dockerjs = require 'docker.js'
fstream = require 'fstream'
path = require 'path'
mongoose = require 'mongoose'
sa = require 'superagent'
tar = require 'tar'

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

imageSchema.set 'toJSON', virtuals: true

imageSchema.index
  tags: 1
  parent: 1

imageSchema.statics.createFromDisk = (name, cb) ->
  runnable = require "#{__dirname}/../../configs/runnables/#{name}/runnable.json"
  if not runnable then cb { code: 500, msg: 'could not load image from disk' } else
    image = new @
      owner: owner
      name: runnable.name
      cmd: runnable.cmd
      file_root: runnable.file_root
    for file in runnable.files
      image.files.push file
    for tag in runnable.tags
      image.tags.push tag
    reader = new fstream.Reader
      path: "#{__dirname}/../../configs/runnables/#{name}"
      filter: () -> not @path.match(/runnable.json/)
    pack = tar.Pack pkg: null
    req = sa.post "#{configs.docker}/build"
    req.type 'application/tar'
    pack.pipe req
    req.end (err, res) ->
      if err then cb { code: 500, msg: 'error building image from Dockerfile' } else
        console.log res.body
        image.docker_id = res.body.Id
        image.save cb
    reader.pipe pack

imageSchema.statics.create = (container, cb) ->
  image = new @
    owner: container.owner
    name: container.name
    parent: container.parent
    cmd: container.cmd
    file_root: container.file_root
  for files in container.files
    image.files.push file.toJSON()
  for tag in container.tags
    image.tags.push tag.toJSON()
  # might have to check for changes, if none, create image from another image (instead of commit)
  docker.commit
    queryParams:
      container: container.docker_id
      m: "#{container.parent} => #{image._id}"
      author: image.owner.toString()
      run: image.cmd
  , (err, result) ->
    if err then cb { code: 500, msg: 'error creating docker image', err: err } else
      image.docker_id = result.Id
      image.save (err) ->
        if err then cb { code: 500, msg: 'error saving image metadata to mongodb' } else
          cb()

imageSchema.statics.destroy = (id, cb) ->
  @findOne _id: id, (err, image) =>
    if err then cb { code: 500, msg: 'error looking up image in mongodb', err: err } else
      if not image then cb { code: 404, msg: 'image not found' } else
        docker.removeImage image.docker_id, (err) =>
          if err then cb { code: 500, msg: 'error removing docker image', err: err } else
            @remove id, (err) ->
              if err then cb { code: 500, msg: 'error removing image metadata from mongodb', err: err } else
                cb()

imageSchema.statics.listTags = (cb) ->
  @find().distinct 'tags', (err, tags) ->
    if err then cb { code: 500, msg: 'error retrieving project tags', err: err } else
      cb null, tags

module.exports = mongoose.model 'Images', imageSchema