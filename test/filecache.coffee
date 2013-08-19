apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'file cache api', ->

  it 'should read a file from the mongodb ::cache if the content exists'
  it 'should read directly from a live container if the ::cache content does not exist'
  it 'should insert files of specific code mirror types into the ::cache for subsequent access'
  it 'should not insert files of non-code code mirror types or no types into the ::cache on writes'
  it 'should remove the contents of files of non-code mirror types from the ::cache when performing a file sync'
  it 'should add the contents of files of codemirror types from the ::cache when performing a sync'