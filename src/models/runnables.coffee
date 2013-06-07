projects = require './projects'
users = require './users'

create = (userId, framework, cb) ->
  projects.create userId, framework, cb

module.exports =
  create: create