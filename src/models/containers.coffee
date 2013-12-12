async = require 'async'
configs = require '../configs'
crypto = require 'crypto'
error = require '../error'
exts = require '../extensions'
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
    index: true
  parent:
    type: ObjectId
    index: true
  child:
    type: ObjectId
  created:
    type: Date
    default: Date.now
    index: true
  target:
    type: ObjectId
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
  output_format:
    type: String
  saved:
    type: Boolean
    default: false
    index: true
  start_cmd:
    type: String
    default: 'date'
  build_cmd:
    type: String
    default: ''
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
  status:
    type: String
    default: 'Draft'
  commit_error:
    type: String
    default: ''

containerSchema.set 'toJSON', virtuals: true
containerSchema.set 'autoIndex', true

containerSchema.index #for cleanup
  saved: 1
  created: 1

containerSchema.index
  tags: 1
  parent: 1

containerSchema.statics.create = (domain, owner, image, data, cb) ->
  if typeof data is 'function'
    cb = data
    data = {}
  data = if data? then data else {}
  image.sync domain, () =>
    servicesToken = 'services-' + uuid.v4()
    env = [
      "RUNNABLE_USER_DIR=#{image.file_root}"
      "RUNNABLE_SERVICE_CMDS=#{image.service_cmds}"
      "RUNNABLE_START_CMD=#{image.start_cmd}"
      "RUNNABLE_BUILD_CMD=#{image.build_cmd}"
      "SERVICES_TOKEN=#{servicesToken}"
      "APACHE_RUN_USER=www-data"
      "APACHE_RUN_GROUP=www-data"
      "APACHE_LOG_DIR=/var/log/apache2"
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
        build_cmd: image.build_cmd
        output_format: image.output_format
        servicesToken: servicesToken
        webToken: 'web-' + uuid.v4()
        specification: image.specification
      for file in image.files
        container.files.push file.toJSON()
      for tag in image.tags
        container.tags.push tag.toJSON()
      if image.revisions and image.revisions.length
        length = image.revisions.length
        revision = image.revisions[length-1]
        repo = encodeId if revision.repo then revision.repo else revision._id.toString()
      else
        repo = encodeId image._id.toString()
      _.extend container, data
      console.log 'Image', "#{configs.dockerRegistry}/runnable/#{repo}"
      request
        url: "#{configs.harbourmaster}/containers"
        method: 'POST'
        pool: false
        json:
          servicesToken: container.servicesToken
          webToken: container.webToken
          subdomain: subdomain
          Env: env
          Hostname: 'runnable'
          Image: "#{configs.dockerRegistry}/runnable/#{repo}"
          PortSpecs: [ container.port.toString() ]
          Cmd: [ container.cmd ]
      , domain.intercept (res) ->
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
          envFull.push "BASE_URL=http://#{implementation.subdomain}.#{configs.domain}"
          createContainer envFull, implementation.subdomain
        else
          createContainer env
    else
      createContainer env

containerSchema.statics.destroy = (domain, id, cb) ->
  @findOne { _id: id } , domain.intercept (container) =>
    if not container then cb error 404, 'container not found' else
      request
        url: "#{configs.harbourmaster}/containers/#{container.servicesToken}"
        method: 'DELETE'
        pool: false
      , domain.intercept (res) =>
        @remove { _id: id }, domain.intercept () ->
          cb()

containerSchema.statics.listSavedContainers = (domain, cb) ->
  timeout = (new Date()).getTime() - configs.containerTimeout
  @find { $or: [ { saved: true }, { created: $gte: timeout } ] }, domain.intercept cb

containerSchema.methods.updateRunOptions = (domain, cb) ->
  self = @
  operations = [
    self.updateBuildCommand.bind self, domain
    self.updateStartCommand.bind self, domain
  ]
  if @specification?
    operations.push self.updateEnvVariables.bind self, domain
  async.parallel operations, cb


containerSchema.methods.updateEnvVariables = (domain, cb) ->
  encodedId = encodeId @_id
  implementations.updateEnvBySpecification domain,
    userId: @owner
    specification: @specification
    containerId: encodedId
  , cb

containerSchema.methods.updateBuildCommand = (domain, cb) ->
  url = "http://#{@servicesToken}.#{configs.domain}/api/buildCmd"
  request.post
    url: url
    pool: false
    json: @build_cmd
  , domain.intercept () -> cb()

containerSchema.methods.updateStartCommand = (domain, cb) ->
  url = "http://#{@servicesToken}.#{configs.domain}/api/cmd"
  request.post
    url: url
    pool: false
    json: @start_cmd
  , domain.intercept () -> cb()

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
  ext.toLowerCase() in exts

containerSchema.methods.syncFiles = (domain, cb) ->
  sync domain, @servicesToken, @, (err) =>
    if err then cb err else
      @last_write = new Date()
      @save domain.intercept () =>
        cb null, @

containerSchema.methods.createFile = (domain, name, filePath, content, cb) ->
  filePath = path.normalize filePath
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
    volumes.streamFile domain, @servicesToken, @file_root, name, filePath, content, (err) =>
      if err then cb err else
        file =
          path: filePath
          name: name
        ext = path.extname name
        if cacheContents ext
          volumes.readFile domain, @servicesToken, @file_root, name, filePath, (err, file_content) =>
            if err then cb err else
              file.content = file_content
              @files.push file
              file = @files[@files.length-1]
              @last_write = new Date()
              @save domain.intercept () ->
                cb null, { _id: file._id, name: file.name, path: file.path, content: file.content }
        else
          @files.push file
          file = @files[@files.length-1]
          @last_write = new Date()
          @save domain.intercept () ->
            cb null, { _id: file._id, name: file.name, path: file.path }

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
    volumes.streamFile domain, @servicesToken, @file_root, foundFile.name, foundFile.path, content, (err) =>
      if err then cb err else
        ext = path.extname foundFile.name
        if cacheContents ext
          volumes.readFile domain, @servicesToken, @file_root, foundFile.name, foundFile.path, (err, file_content) =>
            if err then cb err else
              foundFile.content = file_content
              @last_write = new Date()
              @save domain.intercept () ->
                cb null, { _id: foundFile._id, name: foundFile.name, path: foundFile.path }
        else
          @last_write = new Date()
          @save domain.intercept () ->
            cb null, { _id: foundFile._id, name: foundFile.name, path: foundFile.path }

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
  newPath = path.normalize newPath
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

encodeId = (id) -> id
decodeId = (id) -> id

if configs.shortProjectIds
  encodeId = (id) -> (new Buffer(id.toString(), 'hex')).toString('base64').replace(plus,'-').replace(slash,'_')
  decodeId = (id) -> (new Buffer(id.toString().replace(minus,'+').replace(underscore,'/'), 'base64')).toString('hex');

module.exports = mongoose.model 'Containers', containerSchema
