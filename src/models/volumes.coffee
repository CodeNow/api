configs = require '../configs'
debug = require('debug')('volumes')
upnode = require 'upnode'

up = upnode.connect configs.dnode_host, configs.dnode_port

Volumes =

  createFile: (domain, containerId, srcDir, name, path, content, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call createFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.createFile then throw new Error "harbourmaster does not implement method: createFile"
      debug 'calling remote function createFile()'
      remote.createFile containerId, srcDir, name, path, content, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  readFile: (domain, containerId, srcDir, name, path, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call readFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.readFile then throw new Error "harbourmaster does not implement method: readFile"
      debug 'calling remote function readFile()'
      remote.readFile containerId, srcDir, name, path, domain.bind (err, content) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb null, content

  updateFile: (domain, containerId, srcDir, name, path, content, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call updateFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.updateFile then throw new Error "harbourmaster does not implement method: updateFile"
      debug 'calling remote function updateFile()'
      remote.updateFile containerId, srcDir, name, path, content, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  deleteFile: (domain, containerId, srcDir, name, path, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call deleteFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.deleteFile then throw new Error "harbourmaster does not implement method: deleteFile"
      debug 'calling remote function deleteFile()'
      remote.deleteFile containerId, srcDir, name, path, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  renameFile: (domain, containerId, srcDir, name, path, newName, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call renameFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.renameFile then throw new Error "harbourmaster does not implement method: renameFile"
      debug 'calling remote function renameFile()'
      remote.renameFile containerId, srcDir, name, path, newName, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  moveFile: (domain, containerId, srcDir, name, path, newPath, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call moveFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.moveFile then throw new Error "harbourmaster does not implement method: moveFile"
      debug 'calling remote function moveFile()'
      remote.moveFile containerId, srcDir, name, path, newPath, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  readAllFiles: (domain, containerId, srcDir, ignores, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call readAllFiles() via dnode to harbourmaster"
    , configs.dnode_sync_timeout
    up (remote) ->
      if not remote.readAllFiles then throw new Error "harbourmaster does not implement method: readAllFiles"
      debug 'calling remote function readAllFiles()'
      remote.readAllFiles containerId, srcDir, ignores, domain.bind (err, files) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb null, files

  createDirectory: (domain, containerId, srcDir, name, path, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call createDirectory() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.createDirectory then throw new Error "harbourmaster does not implement method: createDirectory"
      debug 'calling remote function createDirectory()'
      remote.createDirectory containerId, srcDir, name, path, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  readDirectory: (domain, containerId, srcDir, subDir, exts, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call readDirectory() via dnode to harbourmaster"
    , configs.dnode_sync_timeout
    up domain.bind (remote) ->
      if not remote.readDirectory then throw new Error "harbourmaster does not implement method: readDirectory"
      debug 'calling remote function readDirectory()'
      remote.readDirectory containerId, srcDir, subDir, exts, domain.bind (err, files) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb null, files

  removeDirectory: (domain, containerId, srcDir, name, path, recursive, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call removeDirectory() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.removeDirectory then throw new Error "harbourmaster does not implement method: removeDirectory"
      debug 'calling remote function removeDirectory()'
      remote.removeDirectory containerId, srcDir, name, path, recursive, domain.bind (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

module.exports = Volumes