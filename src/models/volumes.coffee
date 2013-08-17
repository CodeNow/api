configs = require '../configs'
debug = require('debug')('volumes')
upnode = require 'upnode'

up = upnode.connect configs.dnode_host, configs.dnode_port

Volumes =

  createFile: (containerId, srcDir, name, path, content, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call createFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.createFile then throw new Error "harbourmaster does not implement method: createFile"
      debug 'calling remote function createFile()'
      remote.createFile containerId, srcDir, name, path, content, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  readFile: (containerId, srcDir, name, path, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call readFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.readFile then throw new Error "harbourmaster does not implement method: readFile"
      debug 'calling remote function readFile()'
      remote.readFile containerId, srcDir, name, path, (err, content) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb null, content

  updateFile: (containerId, srcDir, name, path, content, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call updateFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.updateFile then throw new Error "harbourmaster does not implement method: updateFile"
      debug 'calling remote function updateFile()'
      remote.updateFile containerId, srcDir, name, path, content, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  deleteFile: (containerId, srcDir, name, path, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call deleteFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.deleteFile then throw new Error "harbourmaster does not implement method: deleteFile"
      debug 'calling remote function deleteFile()'
      remote.deleteFile containerId, srcDir, name, path, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  renameFile: (containerId, srcDir, name, path, newName, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call renameFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.renameFile then throw new Error "harbourmaster does not implement method: renameFile"
      debug 'calling remote function renameFile()'
      remote.renameFile containerId, srcDir, name, path, newName, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  moveFile: (containerId, srcDir, name, path, newPath, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call moveFile() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.moveFile then throw new Error "harbourmaster does not implement method: moveFile"
      debug 'calling remote function moveFile()'
      remote.moveFile containerId, srcDir, name, path, newPath, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  readAllFiles: (containerId, srcDir, ignores, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call readAllFiles() via dnode to harbourmaster"
    , configs.dnode_sync_timeout
    up (remote) ->
      if not remote.readAllFiles then throw new Error "harbourmaster does not implement method: readAllFiles"
      debug 'calling remote function readAllFiles()'
      remote.readAllFiles containerId, srcDir, ignores, (err, files) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb null, files

  createDirectory: (containerId, srcDir, name, path, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call createDirectory() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.createDirectory then throw new Error "harbourmaster does not implement method: createDirectory"
      debug 'calling remote function createDirectory()'
      remote.createDirectory containerId, srcDir, name, path, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

  readDirectory: (containerId, srcDir, subDir, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call readDirectory() via dnode to harbourmaster"
    , configs.dnode_sync_timeout
    up (remote) ->
      if not remote.readDirectory then throw new Error "harbourmaster does not implement method: readDirectory"
      debug 'calling remote function readDirectory()'
      remote.readDirectory containerId, srcDir, subDir, (err, files) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb null, files

  removeDirectory: (containerId, srcDir, name, path, recursive, cb) ->
    dnode_timeout = setTimeout () ->
      throw new Error "timeout while trying to call removeDirectory() via dnode to harbourmaster"
    , configs.dnode_access_timeout
    up (remote) ->
      if not remote.removeDirectory then throw new Error "harbourmaster does not implement method: removeDirectory"
      debug 'calling remote function removeDirectory()'
      remote.removeDirectory containerId, srcDir, name, path, recursive, (err) ->
        clearTimeout dnode_timeout
        if err and err.code is 500 then throw new Error err.msg
        if err then cb err else cb()

module.exports = Volumes