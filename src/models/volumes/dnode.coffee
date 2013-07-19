configs = require '../../configs'
upnode = require 'upnode'

Volumes = 
  createFile: proxy 'createFile'
  readFile: proxy 'readFile'
  updateFile: proxy 'updateFile'
  deleteFile: proxy 'deleteFile'
  renameFile: proxy 'renameFile'
  readAllFiles: proxy 'readAllFiles'
  createDirectory: proxy 'createDirectory'
  moveFile: proxy 'moveFile'
  removeDirectory: proxy 'removeDirectory'

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

d.on 'error', (err) ->
  console.log err

module.exports = Volumes

proxy = (method) ->
  ->
    args = arguments
    d (remote) ->
      remote[method].apply(remote, args)