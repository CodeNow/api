async = require 'async'
cp = require 'child_process'
configs = require '../configs'
crypto = require 'crypto'
domain = require 'domain'
error = require '../error'
fs = require 'fs'
path = require 'path'
mongoose = require 'mongoose'
mu = require 'mu2'
request = require 'request'
sync = require './sync'
uuid = require 'node-uuid'
_ = require 'lodash'
textSearch = require 'mongoose-text-search'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

imageSchema = new Schema
  name:
    type: String
  description:
    type: String
    default: ''
  owner:
    type: ObjectId
    index: true
  parent:
    type: ObjectId
    index: true
  created:
    type: Date
    default: Date.now
    index: true
  image:
    type: String
  revisions: [
    repo: String
    created:
      type: Date
      default: Date.now
      index: true
  ]
  dockerfile:
    type: String
  cmd:
    type: String
  copies:
    type: Number
    default: 0
    index: true
  pastes:
    type: Number
    default: 0
    index: true
  cuts:
    type: Number
    default: 0
    index: true
  runs:
    type: Number
    default: 0
    index: true
  views:
    type: Number
    default: 0
    index: true
  votes:
    type: Number
    default: 0
    index: true
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
  output_format:
    type: String
  service_cmds:
    type: String
    default: ''
  start_cmd:
    type: String
    default: 'date'
  build_cmd:
    type: String
    default: ''
  file_root:
    type: String
    default: '/root'
  file_root_host:
    type: String
    default: './src'
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
    index:
      sparse: true

imageSchema.plugin(textSearch)

imageSchema.set 'toJSON', virtuals: true
imageSchema.set 'autoIndex', true

imageSchema.index
  tags: 1
  parent: 1
imageSchema.index
  name: 'text'
  tags: 'text'

buildDockerImage = (domain, fspath, tag, cb) ->
  child = cp.spawn 'tar', [ '-c', '--directory', fspath, '.' ]
  req = request.post
    url: "#{configs.harbourmaster}/build"
    headers: { 'content-type': 'application/tar' }
    qs:
      t: tag
    pool: false
  , domain.intercept (res, body) ->
    if res.statusCode isnt 200 then cb error res.statusCode, body else
      if body.indexOf('Successfully built') is -1 then cb error 400, 'could not build image from dockerfile' else
        cb null, tag
  child.stdout.pipe req

syncDockerImage = (domain, image, cb) ->
  servicesToken = 'services-' + uuid.v4()
  if image.revisions and image.revisions.length
    length = image.revisions.length
    encodedId = encodeId image.revisions[length-1]._id.toString()
  else
    encodedId = encodeId image._id.toString()
  imageTag = "#{configs.dockerRegistry}/runnable/#{encodedId}"
  request
    pool: false
    url: "#{configs.harbourmaster}/containers"
    method: 'POST'
    json:
      servicesToken: servicesToken
      webToken: 'web-' + uuid.v4()
      Env: [
        "RUNNABLE_USER_DIR=#{image.file_root}"
        "RUNNABLE_SERVICE_CMDS=#{image.service_cmds}"
        "RUNNABLE_START_CMD=#{image.start_cmd}"
        "RUNNABLE_BUILD_CMD=#{image.build_cmd}"
        "APACHE_RUN_USER=www-data"
        "APACHE_RUN_GROUP=www-data"
        "APACHE_LOG_DIR=/var/log/apache2"
      ]
      Hostname: image._id.toString()
      Image: imageTag
      PortSpecs: [ image.port.toString() ]
      Cmd: [ image.cmd ]
  , domain.intercept (res, body) ->
    if res.statusCode isnt 201 then cb error res.statusCode, body else
      sync domain, servicesToken, image, (err) ->
        if err then cb err else
          request
            pool: false
            url: "#{configs.harbourmaster}/containers/#{servicesToken}"
            method: 'DELETE'
          , domain.intercept (res) ->
            if res.statusCode isnt 204 then cb error res.statusCode, body else
              cb()

imageSchema.statics.createFromDisk = (domain, owner, runnablePath, sync, cb) ->
  fs.exists "#{runnablePath}/runnable.json", (exists) =>
    if not exists then cb error 400, 'runnable.json not found' else
      try
        runnable = require "#{runnablePath}/runnable.json"
      catch err
        err = err
      if err then cb error 400, 'runnable.json is not valid' else
        if not runnable.name then cb error 400, 'runnable.json is not valid' else
          fs.exists "#{runnablePath}/Dockerfile", (exists) =>
            if not exists then cb error 400, 'dockerfile not found' else
              fs.readFile "#{runnablePath}/Dockerfile", 'utf8', (err, dockerfile) =>
                if err then throw err
                mu.compileText 'Dockerfile', dockerfile, (err, compiled) =>
                  if err then cb error 400, "error compiling mustache template: #{err.message}" else
                    rendered = mu.render compiled,
                      file_root: runnable.file_root
                      file_root_host: runnable.file_root_host
                      image: runnable.image
                      port: runnable.port
                    writestream = fs.createWriteStream "#{runnablePath}/Dockerfile", 'utf8'
                    writestream.on 'error', (err) ->
                      throw err
                    writestream.on 'close', () =>
                      @findOne name: runnable.name, domain.intercept (existing) =>
                        if existing then cb error 403, 'a runnable by that name already exists' else
                          image = new @()
                          encodedId = encodeId image._id.toString()
                          tag = "#{configs.dockerRegistry}/runnable/#{encodedId}"
                          buildDockerImage domain, runnablePath, tag, (err) ->
                            if err then cb err else
                              image.owner = owner
                              image.name = runnable.name
                              image.image = runnable.image
                              image.dockerfile = dockerfile
                              image.cmd = runnable.cmd
                              if runnable.description then image.description = runnable.description
                              if runnable.file_root_host then image.file_root_host = runnable.file_root_host
                              if runnable.file_root then image.file_root = runnable.file_root
                              if runnable.service_cmds then image.service_cmds = runnable.service_cmds
                              if runnable.start_cmd then image.start_cmd = runnable.start_cmd
                              if runnable.build_cmd then image.build_cmd = runnable.build_cmd
                              image.port = runnable.port
                              runnable.tags = runnable.tags or [ ]
                              for file in runnable.files
                                image.files.push file
                              if sync
                                syncDockerImage domain, image, (err) ->
                                  if err then cb err else
                                    image.synced = true
                                    image.save domain.intercept () ->
                                      cb null, image, runnable.tags
                              else
                                image.save domain.intercept () ->
                                  cb null, image, runnable.tags
                    rendered.pipe writestream

imageSchema.statics.createFromContainer = (domain, container, cb) ->
  @findOne name: container.name, domain.intercept (existing) =>
    if existing then cb error 403, 'a shared runnable by that name already exists' else
      image = new @
      copyPublishProperties image, container
      image.revisions = [ ]
      image.revisions.push
        repo: container._id.toString()
      image.synced = true
      encodedId = encodeId image._id.toString()
      container.child = image._id
      container.save domain.intercept () ->
        image.save domain.intercept () ->
          cb null, image

imageSchema.statics.countInChannelByOwner = (domain, channelId, ownerId, cb) ->
  @count {'owner':ownerId, 'tags.channel':channelId}, domain.intercept (count) ->
    cb null, count

imageSchema.statics.search = (domain, searchText, limit, cb) ->
  opts =
    filter : tags:$not:$size:0
    project: name:1, description:1, tags:1, owner:1, created:1
    limit  : if (limit <= configs.defaultPageLimit) then limit else configs.defaultPageLimit
  this.textSearch searchText, opts, (err, output) ->
    if err then throw err else
      images = output.results.map (result) -> result.obj
      cb null, images

imageSchema.statics.incVote = (domain, runnableId, cb) ->
  @update _id:runnableId, {$inc:votes:1}, domain.intercept (success) ->
    cb null, success

imageSchema.methods.updateFromContainer = (domain, container, cb) ->
  copyPublishProperties @, container, true
  @revisions = @revisions or [ ]
  @revisions.push
    repo: container._id.toString()
  container.child = @_id
  container.save domain.intercept () =>
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
  @findOne _id: runnableId, {_id:1, owner:1}, domain.intercept (image) ->
    if not image then cb error 404, 'runnable not found' else
      cb null, image.owner.toString() is userId.toString()

imageSchema.methods.sync = (domain, cb) ->
  if @synced then cb() else
    syncDockerImage domain, @, (err) =>
      if err then cb err else
        @synced = true
        @save domain.intercept () ->
          cb()

plus = /\+/g
slash = /\//g
minus = /-/g
underscore = /_/g

encodeId = (id) -> (new Buffer(id.toString(), 'hex')).toString('base64').replace(plus,'-').replace(slash,'_')

copyPublishProperties = (image, container, noOwner) ->
  properties = [
    'name'
    'description'
    'tags'
    'files'
    'image'
    'dockerfile'
    'file_root'
    'file_root_host'
    'cmd'
    'build_cmd'
    'start_cmd'
    'service_cmds'
    'port',
    'output_format'
  ]
  objectIdProperties = [
    'parent'
    'specification'
  ]
  if (!noOwner) then objectIdProperties.push('owner')
  properties.forEach (property) ->
    image[property] = _.clone container[property]
  objectIdProperties.forEach (property) ->
    image[property] = container[property] && container[property].toString()

module.exports = mongoose.model 'Images', imageSchema
