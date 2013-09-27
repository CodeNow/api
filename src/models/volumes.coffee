configs = require '../configs'
debug = require('debug')('volumes')
error = require '../error'
request = require 'request'

Volumes =

  createFile: (domain, subDomain, srcDir, name, path, content, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/create"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          content: content
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  streamFile: (domain, subDomain, srcDir, name, path, stream, cb) ->
    doReq = () ->
      r = request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/stream"
        method: 'POST'
      form = r.form()
      form.append 'dir', srcDir
      form.append 'name', name
      form.append 'path', path
      form.append 'content', stream
      r.on 'error', (err) ->
       throw err
      r.on 'response', (res) ->
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  readFile: (domain, subDomain, srcDir, name, path, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/read"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb null, res.body.content
    doReq()

  updateFile: (domain, subDomain, srcDir, name, path, content, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/update"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          content: content
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  deleteFile: (domain, subDomain, srcDir, name, path, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/delete"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  renameFile: (domain, subDomain, srcDir, name, path, newName, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/rename"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          newName: newName
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  moveFile: (domain, subDomain, srcDir, name, path, newPath, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/move"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          newPath: newPath
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  readAllFiles: (domain, subDomain, srcDir, ignores, exts, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/readall"
        method: 'POST'
        json:
          dir: srcDir
          ignores: ignores
          exts: exts
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb null, res.body
    doReq()

  createDirectory: (domain, subDomain, srcDir, name, path, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/mkdir"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

  readDirectory: (domain, subDomain, srcDir, subDir, exts, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/readdir"
        method: 'POST'
        json:
          dir: srcDir
          sub: subDir
          exts: exts
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb null, res.body
    doReq()

  removeDirectory: (domain, subDomain, srcDir, name, path, recursive, cb) ->
    doReq = () ->
      request
        pool: false
        url: "http://#{subDomain}.#{configs.domain}/api/files/rmdir"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          recursive: recursive
      , (err, res) ->
        if err then throw err
        if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
          if res.statusCode isnt 201 then cb error res.statusCode, 'unknown error response from runnable' else
            cb()
    doReq()

module.exports = Volumes
