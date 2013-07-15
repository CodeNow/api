async = require 'async'
configs = require '../../configs'
error = require '../../error'
fs = require 'fs'
mkdirp = require 'mkdirp'
rimraf = require 'rimraf'
wrench = require 'wrench'

Volumes =

  createFile: (id, root, name, path, content, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if exists then cb new error { code: 403, msg: 'resource already exists' } else
        fs.writeFile filePath, content, 'utf8', (err) ->
          if err and err.errno is 34 then cb new error { code: 403, msg: 'path does not exist' } else
            if err then cb new error { code: 500, msg: 'error writing file to volume' } else
              cb()

  readFile: (id, root, name, path, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'volume out of sync with mongodb' } else
        fs.readFile filePath,'utf8', (err, content) ->
          if err then cb new error { code: 500, msg: 'error reading project file from volume' } else
            cb null, content

  updateFile: (id, root, name, path, content, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'mongodb and volume out of sync' } else
        fs.writeFile filePath, content, 'utf8', (err) ->
          if err and err.errno is 28 then cb new error { code: 403, msg: 'cannot update contents of a directory' } else
            if err then cb new error { code: 500, msg: 'error writing file to volume' } else
              cb()

  deleteFile: (id, root, name, path, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'volume out of sync with mongodb' } else
        fs.unlink filePath, (err) ->
          if err then cb new error { code: 500, msg: 'error deleting project file from volume' } else
            cb()

  renameFile: (id, root, name, path, newName, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    newFilePath = "#{configs.volumesPath}/#{id}#{path}/#{newName}"
    fs.exists filePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'mongodb and volume out of sync' } else
        fs.exists newFilePath, (exists) ->
          if exists then cb new error { code: 403, msg: 'destination resource already exists' } else
            fs.rename filePath, newFilePath, (err) ->
              if err then cb new error { code: 500, msg: 'error writing file to volume' } else
                cb()

  moveFile: (id, root, name, path, newPath, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    newFilePath = "#{configs.volumesPath}/#{id}#{newPath}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'mongodb and volume out of sync' } else
        fs.exists newFilePath, (exists) ->
          if exists then cb new error { code: 403, msg: 'destination resource already exists' } else
            fs.rename filePath, newFilePath, (err) ->
              if err and err.errno is 18 then cb new error { code: 403, msg: 'cannot move path into itself' } else
                if err and err.errno is 34 then cb new error { code: 403, msg: 'destination does not exist' } else
                  if err and err.errno is 27 then cb new error { code: 403, msg: 'destination is not a directory' } else
                    if err then cb new error { code: 500, msg: 'error writing file to volume' } else
                      cb()

  readAllFiles: (id, root, ignores, cb) ->
    # recursively walk through all files that we shouldnt ignore
    # return the files as the format we want, but without ids obviously
    # the reader will take those and match them up to mongo entries (create, update and delete as neccessary)
    # copy from harbourmaster files.js
    cb()

  createDirectory: (id, root, name, path, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if exists then cb new error { code: 403, msg: 'resource already exists' } else
        fs.mkdir filePath, (err) ->
          if err and err.errno is 34 then cb new error { code: 403, msg: 'path does not exist' } else
            if err then cb new error { code: 500, msg: 'error writing directory to volume' } else
              cb()

  removeDirectory: (id, root, name, path, recursive, cb) ->
    filePath = "#{configs.volumesPath}/#{id}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'volume out of sync with mongodb' } else
        if recursive
          rimraf filePath, (err) ->
            if err then cb new error { code: 500, msg: 'error recursively removing project directory from volume' } else
              cb()
        else
          fs.rmdir filePath, (err) ->
            if err and err.errno is 53 then cb new error { code: 403, msg: 'directory is not empty' } else
              if err then cb new error { code: 500, msg: 'error removing project directory from volume' } else
                cb()

module.exports = Volumes