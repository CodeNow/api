configs = require '../../configs'
upnode = require 'upnode'

Volumes = { }

d = upnode.connect(configs.dnode_host, configs.dnode_port);

d (remote) ->
  if not remote.create then throw new Error 'volume does not implement create()'
  if not remote.remove then throw new Error 'volume does not implement remove()'
  if not remote.copy then throw new Error 'volume does not implement copy()'
  if not remote.createFile then throw new Error 'volume does not implement createFile()'
  if not remote.createFiles then throw new Error 'volume does not implement createFiles()'
  if not remote.readFile then throw new Error 'volume does not implement readFile()'
  if not remote.updateFile then throw new Error 'volume does not implement updateFile()'
  if not remote.deleteFile then throw new Error 'volume does not implement deleteFile()'
  if not remote.renameFile then throw new Error 'volume does not implement renameFile()'
  if not remote.moveFile then throw new Error 'volume does not implement moveFile()'
  if not remote.createDirectory then throw new Error 'volume does not implement createDirectory()'
  if not remote.deleteAllFiles then throw new Error 'volume does not implement deleteAllFiles()'
  if not remote.removeDirectory then throw new Error 'volume does not implement removeDirectory()'
  Volumes.create = remote.create
  Volumes.remove = remote.remove
  Volumes.copy = remote.copy
  Volumes.createFile = remote.createFile
  Volumes.createFiles = remote.createFiles
  Volumes.readFile = remote.readFile
  Volumes.updateFile = remote.updateFile
  Volumes.deleteFile = remote.deleteFile
  Volumes.renameFile = remote.renameFile
  Volumes.moveFile = remote.moveFile
  Volumes.createDirectory = remote.createDirectory
  Volumes.deleteAllFiles = remote.deleteAllFiles
  Volumes.removeDirectory = remote.removeDirectory
  Volumes.readDirectory = remote.readDirectory

d.on 'error', (err) ->
  console.log err

module.exports = Volumes