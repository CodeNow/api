configs = require '../../configs'
fs = require 'fs'
mkdirp = require 'mkdirp'
rimraf = require 'rimraf'
wrench = require 'wrench'

suffix = 'rw'

Volumes =

  create: (root, id, cb) ->
    volumePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}"
    fs.exists volumePath, (exists) ->
      if exists then cb { code: 500, msg: 'project volume already exists' } else
        fs.mkdir volumePath, (err) ->
          if err then cb { code: 500, msg: 'error creating project volume', err: err } else
            cb()

  remove: (root, id, cb) ->
    volumePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}"
    fs.exists volumePath, (exists) ->
      if not exists then cb { code: 500, msg: 'project volume does not exist' } else
        rimraf volumePath, (err) ->
          if err then cb { code: 500, msg: 'error removing project volume', err: err } else
            cb()

  copy: (root, src, dst, cb) ->
    srcPath = "/var/lib/docker/containers/#{src}/#{suffix}#{root}"
    dstPath = "/var/lib/docker/containers/#{dst}/#{suffix}#{root}"
    wrench.copyDirRecursive srcPath, dstPath, (err) ->
      if err then cb { code: 500, msg: 'error copying existing volume to new volume', err: err } else
        cb()

  createFile: (root, id, name, path, content, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if exists then cb { code: 403, msg: 'resource already exists' } else
        fs.writeFile filePath, content, 'utf8', (err) ->
          if err and err.errno is 34 then cb { code: 403, msg: 'path does not exist', err: err } else
            if err then cb { code: 500, msg: 'error writing file to volume', err: err } else
              cb()

  updateFile: (root, id, name, path, content, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'mongodb and volume out of sync' } else
        fs.writeFile filePath, content, 'utf8', (err) ->
          if err and err.errno is 28 then cb { code: 403, msg: 'cannot update contents of a directory', err: err } else
            if err then cb { code: 500, msg: 'error writing file to volume', err: err } else
              cb()

  renameFile: (root, id, name, path, newName, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    newFilePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{newName}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'mongodb and volume out of sync' } else
        fs.exists newFilePath, (exists) ->
          if exists then cb { code: 403, msg: 'destination resource already exists' } else
            fs.rename filePath, newFilePath, (err) ->
              if err then cb { code: 500, msg: 'error writing file to volume', err: err } else
                cb()

  moveFile: (root, id, name, path, newPath, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    newFilePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{newPath}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'mongodb and volume out of sync' } else
        fs.exists newFilePath, (exists) ->
          if exists then cb { code: 403, msg: 'destination resource already exists' } else
            fs.rename filePath, newFilePath, (err) ->
              if err and err.errno is 18 then cb { code: 403, msg: 'cannot move path into itself', err: err } else
                if err and err.errno is 34 then cb { code: 403, msg: 'destination does not exist', err: err} else
                  if err and err.errno is 27 then cb { code: 403, msg: 'destination is not a directory', err: err } else
                    if err then cb { code: 500, msg: 'error writing file to volume', err: err } else
                      cb()

  createDirectory: (root, id, name, path, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if exists then cb { code: 403, msg: 'resource already exists' } else
        fs.mkdir filePath, (err) ->
          if err and err.errno is 34 then cb { code: 403, msg: 'path does not exist', err: err } else
            if err then cb { code: 500, msg: 'error writing directory to volume', err: err } else
              cb()

  readFile: (root, id, name, path, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'volume out of sync with mongodb' } else
        fs.readFile filePath,'utf8', (err, content) ->
          if err then cb { code: 500, msg: 'error reading project file from volume', err: err } else
            cb null, content

  deleteFile: (root, id, name, path, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'volume out of sync with mongodb' } else
        fs.unlink filePath, (err) ->
          if err then cb { code: 500, msg: 'error deleting project file from volume', err: err } else
            cb()

  deleteAllFiles: (root, id, cb) ->
    @remove root, id, (err) =>
      if err then cb err else
        @create root, id, cb

  removeDirectory: (root, id, name, path, recursive, cb) ->
    filePath = "/var/lib/docker/containers/#{id}/#{suffix}#{root}#{path}/#{name}"
    fs.exists filePath, (exists) ->
      if not exists then cb { code: 500, msg: 'volume out of sync with mongodb' } else
        if recursive
          rimraf filePath, (err) ->
            if err then cb { code: 500, msg: 'error recursively removing project directory from volume', err: err } else
              cb()
        else
          fs.rmdir filePath, (err) ->
            if err and err.errno is 53 then cb { code: 403, msg: 'directory is not empty', err: err } else
              if err then cb { code: 500, msg: 'error removing project directory from volume', err: err } else
                cb()

module.exports = Volumes