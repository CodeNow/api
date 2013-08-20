apiserver = require '../lib'
configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'
qs = require 'querystring'

describe 'file streams api', ->

  it 'should be able to ::stream a new file of a code-mirror type to an existing runnable'
  it 'should be able to ::stream a new file of a non code-mirror type (uncached) to an existing runnable'
  it 'should be able to ::stream a file update of a code-mirror type to an existing runnable'
  it 'should be able to ::stream a file update of a non code-mirror type (uncached) to an existing runnable'
  it 'should be able to ::stream a group of code-mirror type files atomically to an existing runnable'
  it 'should be able to ::stream a group of non code-mirror type files atomically to an existing runnable'
  it 'should not update any files if any single file upload fails in a ::streaming group code-mirror file write'
  it 'should not update any files if any single file upload fails in a ::streaming group non code-mirror file write'
  it 'should report the progress of file uploads by polling the api server at regular intervals'