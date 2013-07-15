configs = require '../../configs'
upnode = require 'upnode'

Volumes = { }

d = upnode.connect(configs.dnode_host, configs.dnode_port);

d (remote) ->
  if not remote.createFile then throw new Error 'volume does not implement createFile()'
  if not remote.readFile then throw new Error 'volume does not implement readFile()'
  if not remote.updateFile then throw new Error 'volume does not implement updateFile()'
  if not remote.deleteFile then throw new Error 'volume does not implement deleteFile()'
  if not remote.renameFile then throw new Error 'volume does not implement renameFile()'
  if not remote.moveFile then throw new Error 'volume does not implement moveFile()'
  if not remote.readAllFiles then throw new Error 'volume does not implement readAllFiles()'
  if not remote.createDirectory then throw new Error 'volume does not implement createDirectory()'
  if not remote.removeDirectory then throw new Error 'volume does not implement removeDirectory()'
  Volumes.createFile = remote.createFile
  Volumes.readFile = remote.readFile
  Volumes.updateFile = remote.updateFile
  Volumes.deleteFile = remote.deleteFile
  Volumes.renameFile = remote.renameFile
  Volumes.moveFile = remote.moveFile
  Volumes.readAllFiles = remote.readAllFiles
  Volumes.createDirectory = remote.createDirectory
  Volumes.removeDirectory = remote.removeDirectory

d.on 'error', (err) ->
  console.log err

module.exports = Volumes