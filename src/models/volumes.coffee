configs = require '../configs'
fs = require 'fs'
mkdirp = require 'mkdirp'
rimraf = require 'rimraf'

Volumes =

  create: (id, cb) ->
    volumePath = "#{configs.volumesPath}/#{id}"
    fs.exists volumePath, (exists) ->
      if exists then cb { code: 500, msg: 'project volume already exists' } else
        fs.mkdir volumePath, (err) ->
          if err then cb { code: 500, msg: 'error creating project volume' } else
            cb()

  remove: (id, cb) ->
    volumePath = "#{configs.volumesPath}/#{id}"
    fs.exists volumePath, (exists) ->
      if not exists then cb { code: 500, msg: 'project volume does not exist' } else
        rimraf volumePath, (err, cb) ->
          if err then cb { code: 500, msg: 'error removing project volume' } else
            cb()

  createFile: (id, name, path, content, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if exists then cb { code: 403, msg: 'resource already exists' } else
        fs.writeFile filePath, content, 'utf8', (err) ->
          if err and err.errno is 34 then cb { code: 403, msg: 'path does not exist' } else
            if err then cb { code: 500, msg: 'error writing file to volume' } else
              cb()

  createDirectory: (id, name, path, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if exists then cb { code: 403, msg: 'resource already exists' } else
        fs.mkdir filePath, (err) ->
          if err and err.errno is 34 then cb { code: 403, msg: 'path does not exist' } else
            if err then cb { code: 500, msg: 'error writing directory to volume' } else
              cb()

  readFile: (id, name, path, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'volume out of sync with mongodb' } else
        fs.readFile filePath,'utf8', (err, content) ->
          if err then cb { code: 500, msg: 'error reading project file from volume' } else
            cb null, content

module.exports = Volumes