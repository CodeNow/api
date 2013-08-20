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
              path: "#{__dirname}/fixtures/node.js_express/"
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
              console.log res.body
              instance.stop done

  it 'should return error if streamed gzipped tarball doesnt include a runnable.json file', (done) ->
  it 'should return error if streamed gzipped tarball runnable.json is not valid parsable JSON', (done) ->
  it 'should return error if streamed gzipped tarball runnable.json is not fully specified or broken', (done) ->
  it 'should return error if streamed gzipped tarball file contents cannot be found', (done) ->