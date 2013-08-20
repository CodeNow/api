apiserver = require '../lib'
cp = require 'child_process'
configs = require '../lib/configs'
fstream = require 'fstream'
helpers = require './helpers'
sa = require 'superagent'
tar = require 'tar'
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