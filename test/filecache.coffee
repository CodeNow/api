apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'file caching feature', ->

  it 'should read ignored file contents directly from disk, without ::syncing'
  it 'should write file changes for ignored files directly to container volume without ::syncing'