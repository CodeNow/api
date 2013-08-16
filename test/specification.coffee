configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'
async = require 'async'

# CONFIG

base = "http://localhost:#{configs.port}"

data

expected


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

checkImage = (cb) ->
  req = @owner.get "#{base}/runnables/#{@imageId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      if Array.isArray expected[@type].read
        expected[@type].read.every (obj, i) =>
          Object.keys(obj)
            .every (key) =>
              res.body[@type][i][key].should.equal obj[key]
      else 
        res.body[@type].should.equal expected[@type].read
      cb null

createContainer = (cb) ->
  req = @owner.post "#{base}/users/me/runnables?from=#{@imageId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @containerId = res.body._id
      @token = res.body.token
      cb null

checkContainer = (cb) ->
  req = @owner.get "#{base}/users/me/runnables/#{@containerId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      if Array.isArray expected[@type].read
        expected[@type].read.every (obj, i) =>
          Object.keys(obj)
            .every (key) =>
              res.body[@type][i][key].should.equal obj[key]
      else 
        res.body[@type].should.equal expected[@type].read
      cb null

deleteImage = (cb) ->
  req = @owner.del "#{base}/runnables/#{@imageId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 200
      cb null

recreateImage = (cb) ->
  req = @owner.post "#{base}/runnables?from=#{@containerId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @imageId = res.body._id
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

doOperation = (cb) ->
  url = "#{base}/runnables/#{@imageId}/#{@type}"
  if @operation is 'add' then method = 'post'
  if @operation is 'edit' 
    method = 'put' 
    if @type isnt 'instructions'
      url += "/#{@updateId}"
  if @operation is 'read' then return cb null
  if @operation is 'remove' 
    method = 'del'  
    url += "/#{@updateId}"
  user = @user or @owner
  req = user[method] url
  req.set 'runnable-token', if @isOwner then @ownerToken else @userToken
  if @operation is 'add' then req.send data[@type][@operation]
  if @operation is 'edit' then req.send data[@type][@operation]
  if @operation is 'remove' then req.send @updateId
  req.end (err, res) =>
    if res?.status is 403 then err = new Error 'forbiden'
    if res?.status is 404 then err = new Error "#{url} not found"
    if err && @success then cb err 
    else if err && not @success then cb null
    else if not @success then cb new Error 'should not have succeeded'
    else
     cb null

checkOperation = (cb) ->
  if not @success
    cb null
  else
    user = @user or @owner
    req = user.get "#{base}/runnables/#{@imageId}/#{@type}"
    req.set 'runnable-token', if @isOwner then @ownerToken else @userToken
    req.end (err, res) =>
      if res?.status is 403 then err = new Error 'forbiden'
      if res?.status is 404 then err = new Error 'not found'
      if err then cb err else
        if Array.isArray expected[@type][@operation]
          res.body[@type].length.should.equal expected[@type][@operation].length
          expected[@type][@operation].every (obj, i) =>
            Object.keys(obj)
              .every (key) =>
                res.body[@type][i][key].should.equal obj[key]
        else 
          res.body[@type].should.equal expected[@type][@operation]
        cb null

initOwner = (cb) ->
  req = @owner.post "#{base}/users/me/vars"
  req.set 'runnable-token', @ownerToken
  req.send data.user.create
  req.end (err, res) =>
    if res.status is 404 then err = new Error "init route not found"
    @updateId = res.body._id 
    if err then cb err else cb null

doUserOperation = (cb) ->
  url = "#{base}/users/me/vars"
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
  req = @owner.get "#{base}/users/me/vars"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.body.length.should.equal expected.user[@operation].length
      expected.user[@operation].every (obj, i) =>
        Object.keys(obj)
          .every (key) =>
            res.body[i][key].should.equal obj[key]
      cb null

tryStomp = (cb) ->
  req = @owner.post "#{base}/runnables/#{@imageId}/#{@type}"
  req.set 'runnable-token', @ownerToken
  req.send data[@type].create
  req.end (err, res) =>
    if res?.status is 409 then err = new Error 'conflict'
    if not err then cb new Error 'should not have succeeded' else
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

testCreate = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    createImage.bind @
    initImage.bind @
    checkImage.bind @
    stopServer.bind @
  ]
  async.series list, cb

testPersist = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    createImage.bind @
    initImage.bind @
    checkImage.bind @
    createContainer.bind @
    checkContainer.bind @
  ]
  if @direction is 'backward'
    list = list.concat [
      deleteImage.bind @
      recreateImage.bind @
      checkImage.bind @
    ]
  list.push stopServer.bind @
  async.series list, cb

testCrud = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    createImage.bind @
    initImage.bind @
  ]
  if not @.isOwner
    list.push createUser.bind @
  list = list.concat [
    doOperation.bind @
    checkOperation.bind @
    stopServer.bind @
  ]
  async.series list, cb

testUser = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    initOwner.bind @
    doUserOperation.bind @
    checkUserOperation.bind @
    stopServer.bind @
  ]
  async.series list, cb

testStomp = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    createImage.bind @
    initImage.bind @
    checkImage.bind @
    tryStomp.bind @
    stopServer.bind @
  ]
  async.series list, cb

testContainer = (cb) ->
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

describe 'specification api', ->
  
  it 'should allow publishers to create ::specifications'
  it 'should forbid non-publishers from creating ::specifications'
  it 'should allow specification owners or moderators to edit ::specifications'
  it 'should forbid non-owners/moderators from editing ::specifications'
  it 'should allow specification owners or moderators to remove ::specifications'
  it 'should forbid non-owners/moderators from removing ::specifications'
  it 'should allow owners to read ::specifications'
  it 'should allow non-owners to read ::specifications'

  it 'should allow publishers to attach a ::specifications to a container'
  it 'should persist the ::specifications from a container to an image'
  it 'should persist the ::specifications from an image to a container'
  