configs = require '../configs'
path = require 'path'
volumes = require './volumes'
_ = require 'lodash'

module.exports = (containerId, target, cb) ->
  ignores = [ ]
  new_file_list = [ ]
  for file in target.files
    if file.ignore
      ignores.push path.normalize "#{file.path}/#{file.name}"
      new_file_list.push file
  old_file_list = _.clone target.files
  volumes.readAllFiles containerId, target.file_root, ignores, (err, allFiles) ->
    if err then cb err else
      allFiles.forEach (file) ->
        new_file =
          name: file.name
          path: file.path
        if file.dir
          new_file.dir = true
        else
          new_file.content = file.content
        found = false
        for existingFile in old_file_list
          if file.path is existingFile.path and file.name is existingFile.name
            new_file._id = existingFile._id
            break
        new_file_list.push new_file
      target.files = new_file_list
      cb()