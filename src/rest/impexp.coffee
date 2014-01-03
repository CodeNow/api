async = require 'async'
channels = require '../models/channels'
categories = require '../models/categories'
configs = require '../configs'
debug = require('debug');
domains = require '../domains'
error = require '../error'
express = require 'express'
fs = require 'fs'
fstream = require 'fstream'
mkdirp = require 'mkdirp'
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
    uncompress = zlib.createUnzip()
    req.pipe uncompress
    untar = tar.Parse()
    uncompress.pipe untar
    writer = fstream.Writer
      path: tmpdir
    untar.pipe writer
    req.resume()

    if req.query.sync is 'false' then sync = false else sync = true
    writer.on 'close', () ->
      fs.exists "#{tmpdir}/runnable.json", (exists) ->
        if exists
          runnables.createImageFromDisk req.domain, req.user_id, tmpdir, sync, (err, runnable) ->
            if err then res.json err.code, message: err.msg else
              rimraf tmpdir, (err) ->
                if err then throw err
                res.json 201, runnable
        else
          fs.readdir tmpdir, (err, files) ->
            if err then throw err
            newPath = "#{tmpdir}/#{files[0]}"
            fs.exists "#{newPath}/runnable.json", (exists) ->
              if not exists
                res.json 403, message: 'could not find runnable.json'
              else
                runnables.createImageFromDisk req.domain, req.user_id, newPath, sync, (err, runnable) ->
                  if err then res.json err.code, message: err.msg else
                    rimraf tmpdir, (err) ->
                      if err then throw err
                      res.json 201, runnable

  app.get '/runnables/:id/export', (req, res) ->

    baseTmpDir = "#{os.tmpdir()}/#{uuid.v4()}"
    fs.mkdirSync baseTmpDir
    tmpdir = "#{baseTmpDir}/#{req.params.id}"
    fs.mkdirSync tmpdir
    runnables.getImage req.domain, req.params.id, (err, runnable) ->
      if err then res.json err.code, message: err.msg else
        runnable_json =
          name: runnable.name
          image: runnable.image
          cmd: runnable.start_cmd
          port: runnable.port
          start_cmd: runnable.start_cmd
          build_cmd: runnable.build_cmd
          service_cmds: runnable.service_cmds
          description: runnable.description
          file_root: runnable.file_root
          file_root_host: runnable.file_root_host
        runnable_json.tags = [ ]
        runnable.tags.forEach (tag) ->
          runnable_json.tags.push name: tag.name
        fs.writeFile "#{tmpdir}/Dockerfile", runnable.dockerfile, 'utf8', (err) ->
          if err then throw err
          fs.mkdir "#{tmpdir}/#{runnable.file_root_host}", (err) ->
            if err then throw err
            runnables.createContainer req.domain, req.user_id, req.params.id, (err, container) ->
              if err then res.json err.code, message: err.msg else
                runnables.listFiles req.domain, req.user_id, container._id, true, undefined, undefined, undefined, (err, files) ->
                  if err then res.json err.code, message: err.msg else
                    runnable_json.files = [ ]
                    async.forEach files, (file, cb) ->
                      # push files with non-default options
                      if file.ignore or file.default
                        file.ignore  = file.ignore or false
                        file.dir = file.dir or false
                        file.default = file.default or false
                        runnable_json.files.push
                          name: file.name
                          path: file.path
                          ignore: file.ignore
                          default: file.default
                          dir: file.dir
                      mkdirp "#{tmpdir}/#{runnable.file_root_host}#{file.path}", (err) ->
                        if err then throw err
                        if file.ignore then cb() else
                          if file.dir
                            fs.mkdir "#{tmpdir}/#{runnable.file_root_host}#{file.path}/#{file.name}", (err) ->
                              if err then throw err
                              cb()
                          else
                            fs.writeFile "#{tmpdir}/#{runnable.file_root_host}#{file.path}/#{file.name}", file.content, 'utf8', (err) ->
                              if err then throw err
                              cb()
                    , (err) ->
                      if err then res.json err.code, message: err.msg else
                        fs.writeFile "#{tmpdir}/runnable.json", JSON.stringify(runnable_json, undefined, 2), 'utf8', (err) ->
                          if err then throw err
                          runnables.removeContainer req.domain, req.user_id, container._id, (err) ->
                            if err then res.json err.code, message: err.msg else
                              tmpdir = path.resolve tmpdir
                              compress = zlib.createGzip()
                              packer = tar.Pack()
                              reader = fstream.Reader
                                path: tmpdir
                                type: 'Directory'
                                mode: '0755'
                              reader.pause()
                              res.set 'content-type', 'application/x-gzip'
                              compress.pipe(res)
                              packer.pipe(compress)
                              reader.pipe(packer)
                              res.on 'end', () ->
                                rimraf baseTmpDir, (err) ->
                                  if err then throw err
                              reader.resume()

  app