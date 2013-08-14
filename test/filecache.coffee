apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'file caching feature', ->

  it 'should bypass the ::cache when reading a file from the ignored (uncached) set'
  it 'should bypass the ::cache when writing a file from the ignored (uncached) set'
  it 'should return a mount error when reading a ::cache bypassed file before the container has started'
  it 'should return a mount error when writing a ::cache bypassed file before the container has started'
  it 'return a directory listing of a directory which is bypassed '