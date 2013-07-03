configs = require '../../configs'
error = require '../../error'
fs = require 'fs'
mkdirp = require 'mkdirp'
rimraf = require 'rimraf'
wrench = require 'wrench'

Volumes =

  create: (id, root, cb) ->
    volumePath = "#{configs.volumesPath}/#{id}"
    fs.exists volumePath, (exists) ->
      if exists then cb new error { code: 500, msg: 'project volume already exists' } else
        fs.mkdir volumePath, (err) ->
          if err then cb new error { code: 500, msg: 'error creating project volume' } else
            cb()

  remove: (id, root, cb) ->
    volumePath = "#{configs.volumesPath}/#{id}"
    fs.exists volumePath, (exists) ->
      if not exists then cb new error { code: 500, msg: 'project volume does not exist' } else
        rimraf volumePath, (err) ->
          if err then cb new error { code: 500, msg: 'error removing project volume' } else
            cb()

  copy: (src, dst, root, cb) ->
    srcPath = "#{configs.volumesPath}/#{src}"
    dstPath = "#{configs.volumesPath}/#{dst}"
    wrench.copyDirRecursive srcPath, dstPath, { }, (err) ->
      if err then cb new error { code: 500, msg: 'error copying existing volume to new volume' } else
        cb()

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

  deleteAllFiles: (id, root, cb) ->
    @remove id, (err) =>
      if err then cb err else
        @create id, cb

module.exports = Volumes