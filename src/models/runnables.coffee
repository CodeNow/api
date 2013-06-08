mongoose = require 'mongoose'
projects = require './projects'
users = require './users'

query = mongoose.Query

create = (userId, framework, cb) ->
  projects.create userId, framework, cb

list = (userId, query, cb) ->

listChannels = (cb) ->
  projects.listTags cb

listPublishedProjects = (cb) ->
  listProjects
    tags:
      $not:
        $size: 0
  ,
    sort:'sortOrder'
  , cb

listChannelProjects = (name, cb) ->
  listProjects({
    tags: { $in : [channelName] },
  }, {
    sort:'sortOrder'
  }, cb);

module.exports =
  create: create
  list: list
  listChannels: listChannels
  listPublishedProjects: listPublishedProjects
  listChannelProjects: listChannelProjects