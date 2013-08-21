configs = require '../configs'
path = require 'path'
volumes = require './volumes'
_ = require 'lodash'

module.exports = (domain, containerId, target, cb) ->
  ignores = [ ]
  new_file_list = [ ]
  for file in target.files
    if file.ignore
      ignores.push path.normalize "#{file.path}/#{file.name}"
      new_file_list.push file
  old_file_list = _.clone target.files
  exts = [ '.js', '.md', '.txt', '.py', '.mysql', '.jade', '.css', '.html', '.json', '.php' ]
  volumes.readAllFiles domain, containerId, target.file_root, ignores, exts, (err, allFiles) ->
    if err then cb err else
      allFiles.forEach (file) ->
        new_file =
          name: file.name
          path: file.path
        if file.dir then new_file.dir = true
        if file.content then new_file.content = file.content
        for existingFile in old_file_list
          if file.path is existingFile.path and file.name is existingFile.name
            new_file._id = existingFile._id
            new_file.default = existingFile.default
            new_file.ignore = existingFile.ignore
            break
        new_file_list.push new_file
      target.files = new_file_list
      cb()