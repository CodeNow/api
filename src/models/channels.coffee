projects = require './projects'

Channels =

  listChannels: (cb) ->
    projects.listTags cb

module.exports = Channels