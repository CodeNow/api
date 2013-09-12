async = require 'async'
configs = require '../configs'
concat = require 'concat-stream'
crypto = require 'crypto'
error = require '../error'
exts = require('../extensions')
path = require 'path'
mongoose = require 'mongoose'
request = require 'request'
sync = require './sync'
uuid = require 'node-uuid'
volumes = require  "./volumes"
implementations = require './implementations'
_ = require 'lodash'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

containerSchema = new Schema
  name:
    type: String
  description:
    type: String
    default: ''
  owner:
    type: ObjectId
  parent:
    type: ObjectId
    index: true
  created:
    type: Date
    default: Date.now
  target:
    type: ObjectId
  docker_id:
    type: String
  image:
    type: String
  dockerfile:
    type: String
  cmd:
    type: String
  port:
    type: Number
  servicesToken:
    type: String
  webToken:
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
      ignore:
        type: Boolean
      content:
        type: String
      default:
        type: Boolean
        default: false
    ]
    default: [ ]
  specification:
    type: ObjectId

containerSchema.set 'toJSON', virtuals: true

containerSchema.index
  tags: 1
  parent: 1

containerSchema.statics.create = (domain, owner, image, cb) ->
  image.sync domain, () =>
    env = [
      "RUNNABLE_USER_DIR=#{image.file_root}"
      "RUNNABLE_SERVICE_CMDS=#{image.service_cmds}"
      "RUNNABLE_START_CMD=#{image.start_cmd}"
    ]
    createContainer = (env, subdomain) =>
      container = new @
        parent: image
        name: image.name
        owner: owner
        port: image.port
        cmd: image.cmd
        image: image.image
        file_root: image.file_root
        service_cmds: image.service_cmds
        start_cmd: image.start_cmd
        servicesToken: 'services-' + uuid.v4()
        webToken: 'web-' + uuid.v4()
        specification: image.specification
      for file in image.files
        container.files.push file.toJSON()
      for tag in image.tags
        container.tags.push tag.toJSON()
      encodedId = encodeId image._id.toString()
      request
        url: "#{configs.harbourmaster}/containers"
        method: 'POST'
        json:
          servicesToken: container.servicesToken
          webToken: subdomain or container.webToken
          Env: env
          Hostname: 'runnable'
          Image: "#{configs.dockerRegistry}/runnable/#{encodedId}"
          PortSpecs: [ container.port.toString() ]
          Cmd: [ container.cmd ]
      , domain.intercept (res) ->
        container.docker_id = res.body._id
        container.save domain.intercept () ->
          cb null, container
    if image.specification?
      implementations.findOne
        owner: owner
        implements: image.specification
      , domain.intercept (implementation) =>
        if implementation?
          envFull = env.concat implementation.toJSON().requirements.map (requirement) ->
            "#{requirement.name}=#{requirement.value}"
          createContainer envFull, implementation.subdomain
        else
          createContainer env
    else
      createContainer env

containerSchema.statics.destroy = (domain, id, cb) ->
  @findOne { _id: id } , domain.intercept (container) =>
    if not container then cb error 404, 'container metadata not found' else
      container.getProcessState domain, (err, state) =>
        if err then cb err else
          remove = () =>
            request
              url: "#{configs.harbourmaster}/containers/#{container.docker_id}"
              method: 'DELETE'
            , domain.intercept (res) =>
              @remove { _id: id }, domain.intercept () ->
                cb()
          if not state.running then remove() else
            container.stop domain, (err) =>
              if err then cb err else
                remove()

containerSchema.methods.getProcessState = (domain, cb) ->
  request
    url: "http://#{@servicesToken}.#{configs.domain}/api/running"
    method: 'GET'
    timeout: configs.runnable_access_timeout
  , domain.intercept (res) ->
    if res.statusCode is 503 then cb null, running: false else
      if res.statusCode is 502 then cb error 500, 'runnable not responding to status requests' else
        if res.statusCode is 400 then cb error 500, 'runnable is not configured on subdomain' else
          if res.statusCode isnt 200 then cb error res.statusCode, 'unknown runnable error' else
            res.body = JSON.parse res.body
            cb null, running: res.body.running

containerSchema.methods.start = (domain, cb) ->
  doReq = () =>
    request
      url: "http://#{@servicesToken}.#{configs.domain}/api/start"
      method: 'GET'
      timeout: configs.runnable_access_timeout
    , domain.intercept (res) ->
      if res.statusCode is 503
        setTimeout () ->
          doReq()
        , 500
      else
        if res.statusCode is 502 then cb error 500, 'runnable not responding to start request' else
          if res.statusCode is 400 then cb error 500, 'runnable is not configured on subdomain' else
            if res.statusCode isnt 200 then cb error res.statusCode, 'unknown runnable error' else
              cb()
  doReq()

containerSchema.methods.stop = (domain, cb) ->
  request
    url: "http://#{@servicesToken}.#{configs.domain}/api/stop"
    method: 'GET'
    timeout: configs.runnable_access_timeout
  , domain.intercept (res) ->
    if res.statusCode is 503 then cb() else # container is not running no sense in waking it up
      if res.statusCode is 502 then cb error 500, 'runnable not responding to stop request' else
        if res.statusCode is 400 then cb error 500, 'runnable is not configured on subdomain' else
          if res.statusCode isnt 200 then cb error res.statusCode, 'unknown runnable error' else
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

cacheContents = (ext) ->
  ext in exts

containerSchema.methods.syncFiles = (domain, cb) ->
  sync domain, @servicesToken, @, (err) =>
    if err then cb err else
      @last_write = new Date()
      @save domain.intercept () =>
        cb null, @

containerSchema.methods.createFile = (domain, name, filePath, content, cb) ->
  if typeof content is 'string'
    volumes.createFile domain, @servicesToken, @file_root, name, filePath, content, (err) =>
      if err then cb err else
        file =
          path: filePath
          name: name
        ext = path.extname name
        if cacheContents ext
          file.content = content
        @files.push file
        file = @files[@files.length-1]
        @last_write = new Date()
        @save domain.intercept () ->
          cb null, { _id: file._id, name: name, path: filePath }
  else
    store = concat (file_content) =>
      volumes.createFile domain, @servicesToken, @file_root, name, filePath, file_content.toString(), (err) =>
        if err then cb err else
          file =
            path: filePath
            name: name
          ext = path.extname name
          if cacheContents ext
            file.content = file_content
          @files.push file
          file = @files[@files.length-1]
          @last_write = new Date()
          @save domain.intercept () ->
            cb null, { _id: file._id, name: name, path: filePath }
    content.pipe store

containerSchema.methods.updateFile = (domain, fileId, content, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    volumes.updateFile domain, @servicesToken, @file_root, file.name, file.path, content, (err) =>
      if err then cb err else
        ext = path.extname file.name
        if cacheContents ext
          file.content = content
        @last_write = new Date()
        @save domain.intercept () ->
          cb null, file

containerSchema.methods.updateFileContents = (domain, filePath, content, cb) ->
  foundFile = null
  filePath = path.normalize filePath
  @files.forEach (file) ->
    elemPath = path.normalize "#{file.path}/#{file.name}"
    if elemPath is filePath
      foundFile = file
  if not foundFile then cb error 404, 'file does not exist' else
    store = concat (file_content) =>
      volumes.updateFile domain, @servicesToken, @file_root, foundFile.name, foundFile.path, file_content.toString(), (err) =>
        if err then cb err else
          ext = path.extname foundFile.name
          if cacheContents ext
            foundFile.content = file_content
          @last_write = new Date()
          @save domain.intercept () ->
            cb null, foundFile
    content.pipe store

containerSchema.methods.renameFile = (domain, fileId, newName, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    volumes.renameFile domain, @servicesToken, @file_root, file.name, file.path, newName, (err) =>
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
        else
          oldExt = path.extname oldName
          newExt = path.extname newName
          oldCached = cacheContents oldExt
          newCached = cacheContents newExt
          if oldCached and not newCached
            file.content = undefined
            file.default = false
          if not oldCached and newCached
            volumes.readFile domain, @servicesToken, @file_root, file.name, file.path, (err, content) =>
              if err then cb err else
                file.content = content
                @last_write = new Date()
                @save domain.intercept () ->
                  cb null, file
          else
            @last_write = new Date()
            @save domain.intercept () ->
              cb null, file

containerSchema.methods.moveFile = (domain, fileId, newPath, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    volumes.moveFile domain, @servicesToken, @file_root, file.name, file.path, newPath, (err) =>
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
  volumes.createDirectory domain, @servicesToken, @file_root, name, path, (err) =>
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
      if not file.content and isDefault then cb error 403, 'cannot tag an uncached file as default' else
        file.default = isDefault
        @save domain.intercept () ->
          cb null, file

containerSchema.methods.deleteFile = (domain, fileId, recursive, cb) ->
  file = @files.id fileId
  if not file then cb error 404, 'file does not exist' else
    if not file.dir
      volumes.deleteFile domain, @servicesToken, @file_root, file.name, file.path, (err) =>
        if err then cb err else
          file.remove()
          @last_write = new Date()
          @save domain.intercept () ->
            cb()
    else
      volumes.removeDirectory domain, @servicesToken, @file_root, file.name, file.path, recursive, (err) =>
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
      volumes.readDirectory domain, @servicesToken, @file_root, subDir, exts, (err, files) ->
        if err then cb err else
          cb null, files

plus = /\+/g
slash = /\//g
minus = /-/g
underscore = /_/g

encodeId = (id) -> (new Buffer(id.toString(), 'hex')).toString('base64').replace(plus,'-').replace(slash,'_')

module.exports = mongoose.model 'Containers', containerSchema
