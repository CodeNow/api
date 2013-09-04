configs = require '../configs'
debug = require('debug')('volumes')
error = require '../error'
request = require 'request'

Volumes =

  createFile: (domain, subDomain, srcDir, name, path, content, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/create"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          content: content
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

  readFile: (domain, subDomain, srcDir, name, path, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/read"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb null, res.body.content
    doReq()

  updateFile: (domain, subDomain, srcDir, name, path, content, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/update"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          content: content
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

  deleteFile: (domain, subDomain, srcDir, name, path, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/delete"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

  renameFile: (domain, subDomain, srcDir, name, path, newName, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/rename"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          newName: newName
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

  moveFile: (domain, subDomain, srcDir, name, path, newPath, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/move"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          newPath: newPath
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

  readAllFiles: (domain, subDomain, srcDir, ignores, exts, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/readall"
        method: 'POST'
        json:
          dir: srcDir
          ignores: ignores
          exts: exts
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb null, res.body
    doReq()

  createDirectory: (domain, subDomain, srcDir, name, path, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/mkdir"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

  readDirectory: (domain, subDomain, srcDir, subDir, exts, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/readdir"
        method: 'POST'
        json:
          dir: srcDir
          sub: subDir
          exts: exts
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb null, res.body
    doReq()

  removeDirectory: (domain, subDomain, srcDir, name, path, recursive, cb) ->
    doReq = () ->
      req = request
        url: "http://#{subDomain}.#{configs.domain}/api/files/rmdir"
        method: 'POST'
        json:
          dir: srcDir
          name: name
          path: path
          recursive: recursive
        timeout: configs.runnable_access_timeout
      , (err, res) ->
        if err then throw err
        if res.statusCode is 503
          setTimeout () ->
            doReq()
          , 500
        else
          if res.statusCode is 502 then cb error 500, 'runnable not responding to file requests' else
            if res.statusCode isnt 201 then cb error res.statusCode, res.body.message else
              cb()
    doReq()

module.exports = Volumes