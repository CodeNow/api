configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'
async = require 'async'

# CONFIG

base = "http://localhost:#{configs.port}"

data = {}

expected = {}


# UTILITIES AND TESTS

createServer = (cb) ->
  helpers.createServer configs, cb, (err, instance) =>
    if err then cb err else
      @instance = instance
      @oldSalt = instance.configs.passwordSalt
      delete instance.configs.passwordSalt
      cb null

createOwner = (cb) ->
  @owner = sa.agent()
  req = @owner.post "#{base}/token"
  req.set 'Content-Type', 'application/json'
  req.send JSON.stringify 
    username: 'publisher' 
    password: 'testing'
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 200
      @ownerToken = res.body.access_token
      cb null

createModerator = (cb) ->
  @moderator = sa.agent()
  req = @user.post "#{base}/token"
  req.set 'Content-Type', 'application/json'
  req.send JSON.stringify 
    username: 'test4@testing.com' 
    password: 'testing'
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 200
      @moderatorToken = res.body.access_token
      cb null

createUser = (cb) ->
  @user = sa.agent()
  req = @user.post "#{base}/token"
  req.set 'Content-Type', 'application/json'
  req.send JSON.stringify 
    username: 'matchusername5' 
    password: 'testing'
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 200
      @userToken = res.body.access_token
      cb null

initOwner = (cb) ->
  req = @owner.post "#{base}/implimentations"
  req.set 'runnable-token', @ownerToken
  req.send data.user.create
  req.end (err, res) =>
    if res.status is 404 then err = new Error "init route not found"
    @updateId = res.body._id 
    if err then cb err else cb null

doUserOperation = (cb) ->
  url = "#{base}/implimentations"
  if @operation is 'add' then method = 'post'
  if @operation is 'edit'
    method = 'put' 
    url += "/#{@updateId}"
  if @operation is 'read' then return cb null
  if @operation is 'remove'
    method = 'del'
    url += "/#{@updateId}"
  req = @owner[method] url
  req.set 'runnable-token', @ownerToken
  if @operation is 'add' then req.send data.user.add
  if @operation is 'edit' then req.send data.user.edit
  req.end (err, res) =>
    if res?.status is 403 then err = new Error 'forbiden'
    if res?.status is 404 then err = new Error 'not found'
    if err then cb err else cb null

checkUserOperation = (cb) ->
  req = @owner.get "#{base}/implimentations"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.body.length.should.equal expected.user[@operation].length
      expected.user[@operation].every (obj, i) =>
        Object.keys(obj)
          .every (key) =>
            res.body[i][key].should.equal obj[key]
      cb null

createImage = (cb) ->
  req = @owner.post "#{base}/runnables"
  req.set 'runnable-token', @ownerToken
  req.send data[@type].create
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @imageId = res.body._id
      cb null

initImage = (cb) ->
  method = if @type is 'instructions' then 'put' else 'post'
  req = @owner[method] "#{base}/runnables/#{@imageId}/#{@type}"
  req.set 'runnable-token', @ownerToken
  req.send data[@type].create
  req.end (err, res) =>
    if res.status is 404 then err = new Error "init route not found"
    @updateId = res.body._id 
    if err then cb err else cb null

createContainer = (cb) ->
  req = @owner.post "#{base}/users/me/runnables?from=#{@imageId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @containerId = res.body._id
      @token = res.body.token
      cb null

setEnv = (cb) ->
  type = if @type is 'globalVars' then 'user' else @type
  controlUrl = "http://#{@token}.runnableapp.dev/api/envs"
  wake = @owner.get controlUrl
  wake.end (err, res) =>
    if err then cb err else
      set = @owner.post controlUrl
      set.send
        key: data[type].add.key
        value: data[type].add.value
      set.end (err, res) =>
        if err then cb err else
          cb null

checkEnv = (cb) ->
  termUrl = "http://terminals.runnableapp.dev/term.html?termId=#{@token}"
  helpers.sendCommand termUrl, 'env', (err, env) =>
    if err then cb err else
      if not expected.env[@type][@existing].test env
        cb new Error 'vars not found'
      else
        cb null

stopServer = (cb) ->
  @instance.configs.passwordSalt = @oldSalt
  @instance.stop cb

# TEST CONTROLLERS

testCrud = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    createImage.bind @
    initImage.bind @
  ]
  if @userType is 'moderator'
    list.push createModerator.bind @
  if @userType is 'non-owner'
    list.push createUser.bind @
  list = list.concat [
    doOperation.bind @
    checkOperation.bind @
    stopServer.bind @
  ]
  async.series list, cb

testStart = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
  ]
  if @with 
    list.push initOwner.bind @
  list = list.concat [
    createImage.bind @
    initImage.bind @
    createContainer.bind @
    startContainer.bind @
    stopServer.bind @
  ]
  async.series list, cb

testUrl = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    initOwner.bind @
    createImage.bind @
    initImage.bind @
    createContainer.bind @
    startContainer.bind @
    checkUrl.bind @
    stopServer.bind @
  ]
  async.series list, cb

testVariables = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    initOwner.bind @
    createImage.bind @
    initImage.bind @
    createContainer.bind @
  ]
  if @existing is 'added'
    list.push setEnv.bind @
  list = list.concat [
    checkEnv.bind @
    stopServer.bind @
  ]
  async.series list, cb

# DESCRIPTION

describe 'implimentation api', ->
  
  it 'should allow owners to create ::implimentations'
  it 'should allow owners to edit ::implimentations'
  it 'should allow owners to view ::implimentations'
  it 'should allow owners to list ::implimentations'
  it 'should allow owners to remove ::implimentations'

  it 'should allow moderators to create ::implimentations'
  it 'should allow moderators to edit ::implimentations'
  it 'should allow moderators to view ::implimentations'
  it 'should allow moderators to list ::implimentations'
  it 'should allow moderators to remove ::implimentations'

  it 'should forbid non-owners/moderators to create ::implimentations'
  it 'should forbid non-owners/moderators to edit ::implimentations'
  it 'should forbid non-owners/moderators to view ::implimentations'
  it 'should forbid non-owners/moderators to remove ::implimentations'

  it 'should allow container start with ::implimentations'
  it 'should forbid container start without ::implimentations'

  it 'should cause the web page to use the ::implimentations url'

  it 'should have existing ::implimentations env variables set'
  it 'should set ::implimentations env variables on demand'
  