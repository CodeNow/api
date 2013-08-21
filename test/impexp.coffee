apiserver = require '../lib'
cp = require 'child_process'
configs = require '../lib/configs'
fs = require 'fs'
fstream = require 'fstream'
helpers = require './helpers'
os = require 'os'
sa = require 'superagent'
rimraf = require 'rimraf'
tar = require 'tar'
uuid = require 'node-uuid'
qs = require 'querystring'
zlib = require 'zlib'

describe 'import/export api', ->

  it 'should read a ::streamed gzipped tarball that was sent via a unix command-line', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        # tar -cz . | curl -XPOST -sSNT- localhost:3030/runnables/import
        instance.stop done

  it 'should read a ::streamed gzipped tarball and create a new runnable from the data', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            req = user.post("http://localhost:#{configs.port}/runnables/import")
            req.set 'content-type', 'application/x-gzip'
            compress = zlib.createGzip()
            packer = tar.Pack()
            reader = fstream.Reader
              path: "#{__dirname}/fixtures/node.js_express"
              type: 'Directory'
              mode: '0755'
            compress.pipe(req)
            packer.pipe(compress)
            reader.pipe(packer)
            reader.resume()
            req.on 'error', (err) ->
              done err
            req.on 'response', (res) ->
              res.should.have.status 201
              res.body.should.have.property 'name', 'Hello node.js!'
              instance.stop done

  it 'should return error if ::streamed gzipped tarball doesnt include a runnable.json file', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            req = user.post("http://localhost:#{configs.port}/runnables/import")
            req.set 'content-type', 'application/x-gzip'
            compress = zlib.createGzip()
            packer = tar.Pack()
            reader = fstream.Reader
              path: "#{__dirname}/fixtures/no_runnable_json"
              type: 'Directory'
              mode: '0755'
            compress.pipe(req)
            packer.pipe(compress)
            reader.pipe(packer)
            reader.resume()
            req.on 'error', (err) ->
              done err
            req.on 'response', (res) ->
              res.should.have.status 400
              res.body.should.have.property 'message', 'runnable.json not found'
              instance.stop done

  it 'should return error if ::streamed gzipped tarball runnable.json is not valid parsable JSON', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            req = user.post("http://localhost:#{configs.port}/runnables/import")
            req.set 'content-type', 'application/x-gzip'
            compress = zlib.createGzip()
            packer = tar.Pack()
            reader = fstream.Reader
              path: "#{__dirname}/fixtures/bad_runnable_json"
              type: 'Directory'
              mode: '0755'
            compress.pipe(req)
            packer.pipe(compress)
            reader.pipe(packer)
            reader.resume()
            req.on 'error', (err) ->
              done err
            req.on 'response', (res) ->
              res.should.have.status 400
              res.body.should.have.property 'message', 'runnable.json is not valid'
              instance.stop done

  it 'should return error if ::streamed gzipped tarball runnable.json is not valid', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            req = user.post("http://localhost:#{configs.port}/runnables/import")
            req.set 'content-type', 'application/x-gzip'
            compress = zlib.createGzip()
            packer = tar.Pack()
            reader = fstream.Reader
              path: "#{__dirname}/fixtures/missing_name"
              type: 'Directory'
              mode: '0755'
            compress.pipe(req)
            packer.pipe(compress)
            reader.pipe(packer)
            reader.resume()
            req.on 'error', (err) ->
              done err
            req.on 'response', (res) ->
              res.should.have.status 400
              res.body.should.have.property 'message', 'runnable.json is not valid'
              instance.stop done

  it 'should read a ::streamed gzipped tarball and create new channels from tag data', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.authedRegisteredUser (err, user) ->
          if err then done err else
            req = user.post("http://localhost:#{configs.port}/runnables/import")
            req.set 'content-type', 'application/x-gzip'
            compress = zlib.createGzip()
            packer = tar.Pack()
            reader = fstream.Reader
              path: "#{__dirname}/fixtures/node.js_tagged"
              type: 'Directory'
              mode: '0755'
            compress.pipe(req)
            packer.pipe(compress)
            reader.pipe(packer)
            reader.resume()
            req.on 'error', (err) ->
              done err
            req.on 'response', (res) ->
              res.should.have.status 201
              res.body.tags.should.be.a.array
              res.body.tags.length.should.equal 1
              instance.stop done

  it 'should read a ::streamed gzipped tarball and link existing channels from tag data', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'node.js', (err, channel) ->
          if err then done err else
            existingChannelId = channel._id
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                req = user.post("http://localhost:#{configs.port}/runnables/import")
                req.set 'content-type', 'application/x-gzip'
                compress = zlib.createGzip()
                packer = tar.Pack()
                reader = fstream.Reader
                  path: "#{__dirname}/fixtures/node.js_tagged"
                  type: 'Directory'
                  mode: '0755'
                compress.pipe(req)
                packer.pipe(compress)
                reader.pipe(packer)
                reader.resume()
                req.on 'error', (err) ->
                  done err
                req.on 'response', (res) ->
                  res.should.have.status 201
                  res.body.tags.should.be.a.array
                  res.body.tags.length.should.equal 1
                  res.body.tags[0].channel.should.equal existingChannelId
                  instance.stop done

  it 'should return error if ::streamed gzipped tarball Dockerfile triggers a docker build error', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'node.js', (err, channel) ->
          if err then done err else
            existingChannelId = channel._id
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                req = user.post("http://localhost:#{configs.port}/runnables/import")
                req.set 'content-type', 'application/x-gzip'
                compress = zlib.createGzip()
                packer = tar.Pack()
                reader = fstream.Reader
                  path: "#{__dirname}/fixtures/bad_dockerfile"
                  type: 'Directory'
                  mode: '0755'
                compress.pipe(req)
                packer.pipe(compress)
                reader.pipe(packer)
                reader.resume()
                req.on 'error', (err) ->
                  done err
                req.on 'response', (res) ->
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'could not build image from dockerfile'
                  instance.stop done

  ### TODO: figure out how to do this
  it 'should return error if ::streamed gzipped tarball Dockerfile template references undefined variable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createChannel 'node.js', (err, channel) ->
          if err then done err else
            existingChannelId = channel._id
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                req = user.post("http://localhost:#{configs.port}/runnables/import")
                req.set 'content-type', 'application/x-gzip'
                compress = zlib.createGzip()
                packer = tar.Pack()
                reader = fstream.Reader
                  path: "#{__dirname}/fixtures/undefined_mustache_variable"
                  type: 'Directory'
                  mode: '0755'
                compress.pipe(req)
                packer.pipe(compress)
                reader.pipe(packer)
                reader.resume()
                req.on 'error', (err) ->
                  done err
                req.on 'response', (res) ->
                  res.should.have.status 400
                  res.body.should.have.property 'message', 'could not build image from dockerfile'
                  instance.stop done
  ###

  it 'should write a ::streamed gzipped tarball when hitting the export route of an existing runnable', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                tmpDir = "#{os.tmpdir()}/#{uuid.v4()}"
                req = user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/export")
                req.on 'response', (res) ->
                  res.should.have.status 200
                  res.get('content-type').should.equal 'application/x-gzip'
                fs.mkdirSync tmpDir
                uncompress = zlib.createGunzip()
                parser = tar.Parse()
                writer = fstream.Writer
                  path: tmpDir
                  type: 'Directory'
                  mode: '0755'
                req.pipe(uncompress)
                uncompress.pipe(parser)
                parser.pipe(writer)
                writer.on 'end', () ->
                  fs.readdir tmpDir, (err, files) ->
                    if err then done err else
                      dir = "#{tmpDir}/#{files[0]}"
                      fs.existsSync("#{dir}/runnable.json").should.equal true
                      fs.existsSync("#{dir}/Dockerfile").should.equal true
                      runnable_json = require "#{dir}/runnable.json"
                      runnable_json.should.have.property 'service_cmds'
                      runnable_json.should.have.property 'start_cmd'
                      runnable_json.should.have.property 'tags'
                      runnable_json.should.have.property 'image'
                      runnable_json.should.have.property 'file_root'
                      runnable_json.should.have.property 'file_root_host'
                      runnable_json.should.have.property 'port'
                      runnable_json.should.have.property 'files'
                      runnable_json.files.should.be.a.array
                      runnable_json.files.length.should.equal 2
                      runnable_json.files[0].should.have.property 'default'
                      runnable_json.files[0].should.have.property 'ignore'
                      runnable_json.files[0].should.have.property 'name'
                      runnable_json.files[1].should.have.property 'default'
                      runnable_json.files[1].should.have.property 'ignore'
                      runnable_json.files[1].should.have.property 'name'
                      rimraf tmpDir, (err) ->
                        if err then done err else
                          instance.stop done

  it 'should be able to seamlessly import an exported runnable via ::streams', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createImage 'node.js', (err, runnableId) ->
          if err then done err else
            helpers.authedRegisteredUser (err, user) ->
              if err then done err else
                tmpDir = "#{os.tmpdir()}/#{uuid.v4()}"
                req = user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/export")
                req.on 'response', (res) ->
                  res.should.have.status 200
                  res.get('content-type').should.equal 'application/x-gzip'
                fs.mkdirSync tmpDir
                uncompress = zlib.createGunzip()
                parser = tar.Parse()
                writer = fstream.Writer
                  path: tmpDir
                  type: 'Directory'
                  mode: '0755'
                req.pipe(uncompress)
                uncompress.pipe(parser)
                parser.pipe(writer)
                writer.on 'end', () ->
                  fs.readdir tmpDir, (err, files) ->
                    if err then done err else
                      dir = "#{tmpDir}/#{files[0]}"
                      runnable_json = require "#{dir}/runnable.json"
                      runnable_json.name = 'this is a new name'
                      fs.writeFileSync "#{dir}/runnable.json", JSON.stringify(runnable_json, undefined, 2), 'utf8'
                      req = user.post("http://localhost:#{configs.port}/runnables/import")
                      req.set 'content-type', 'application/x-gzip'
                      compress = zlib.createGzip()
                      packer = tar.Pack()
                      reader = fstream.Reader
                        path: dir
                        type: 'Directory'
                        mode: '0755'
                      compress.pipe(req)
                      packer.pipe(compress)
                      reader.pipe(packer)
                      reader.resume()
                      req.on 'error', (err) ->
                        done err
                      req.on 'response', (res) ->
                        res.should.have.status 201
                        res.body.should.have.property 'name', 'this is a new name'
                        rimraf tmpDir, (err) ->
                          if err then done err else
                            instance.stop done

  it 'should write a ::streamed gzipped tarball when hitting the export route of an existing runnable with a channel', (done) ->
    helpers.createServer configs, done, (err, instance) ->
      if err then done err else
        helpers.createTaggedImage 'node.js', 'myChannel', (err, runnableId) ->
          if err then done err else
            helpers.authedUser (err, user) ->
              if err then done err else
                tmpDir = "#{os.tmpdir()}/#{uuid.v4()}"
                req = user.get("http://localhost:#{configs.port}/runnables/#{runnableId}/export")
                req.on 'response', (res) ->
                  res.should.have.status 200
                  res.get('content-type').should.equal 'application/x-gzip'
                fs.mkdirSync tmpDir
                uncompress = zlib.createGunzip()
                parser = tar.Parse()
                writer = fstream.Writer
                  path: tmpDir
                  type: 'Directory'
                  mode: '0755'
                req.pipe(uncompress)
                uncompress.pipe(parser)
                parser.pipe(writer)
                writer.on 'end', () ->
                  fs.readdir tmpDir, (err, files) ->
                    if err then done err else
                      dir = "#{tmpDir}/#{files[0]}"
                      fs.existsSync("#{dir}/runnable.json").should.equal true
                      fs.existsSync("#{dir}/Dockerfile").should.equal true
                      runnable_json = require "#{dir}/runnable.json"
                      runnable_json.should.have.property 'tags'
                      runnable_json.tags.should.be.a.array
                      runnable_json.tags.length.should.equal 1
                      runnable_json.tags[0].should.have.property 'name', 'myChannel'
                      rimraf tmpDir, (err) ->
                        if err then done err else
                          instance.stop done