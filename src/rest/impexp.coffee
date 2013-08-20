channels = require '../models/channels'
categories = require '../models/categories'
configs = require '../configs'
debug = require('debug');
domains = require '../domains'
error = require '../error'
express = require 'express'
fs = require 'fs'
fstream = require 'fstream'
os = require 'os'
path = require 'path'
users = require '../models/users'
uuid = require 'node-uuid'
rimraf = require 'rimraf'
runnables = require '../models/runnables'
tar = require 'tar'
zlib = require 'zlib'

module.exports = (parentDomain) ->

  app = express()

  app.use domains parentDomain

  app.post '/runnables/import', (req, res) ->

    req.pause()
    tmpdir = "#{os.tmpdir()}/#{uuid.v4()}"
    fs.mkdirSync tmpdir
    console.log tmpdir
    uncompress = zlib.createUnzip()
    req.pipe uncompress
    untar = tar.Parse()
    uncompress.pipe untar
    writer = fstream.Writer
      path: tmpdir
    untar.pipe writer
    req.resume()

    writer.on 'close', () ->
      fs.exists "#{tmpdir}/runnable.json", (exists) ->
        if exists
          runnables.createImageFromDisk req.domain, req.user_id, tmpdir, true, (err, runnable) ->
            if err then res.json err.code, message: err.msg else
              rimraf tmpdir, (err) ->
                if err then throw err else
                  res.json 201, runnable
        else
          fs.readdir tmpdir, (err, files) ->
            if err then throw err
            newPath = "#{tmpdir}/#{files[0]}"
            runnables.createImageFromDisk req.domain, req.user_id, newPath, true, (err, runnable) ->
              if err then res.json err.code, message: err.msg else
                rimraf tmpdir, (err) ->
                  if err then throw err else
                    res.json 201, runnable

  app.get '/runnables/:id/export', (req, res) ->
    res.json 200, message: 'runnable exported'

  app