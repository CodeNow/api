configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'
async = require 'async'

# CONFIG

base = "http://localhost:#{configs.port}"

data =
  specification:
    create:
      name: 'name1'
      description: 'first spec'
      instructions: 'fill me in bro'
      requirements: [
        'FIRST_REQUIREMENT'
      ]
  implimentation:
    create:
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'FIRST_VALUE'
      ]
    add:
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'FIRST_VALUE'
      ]
    edit:
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'EDITED_VALUE'
      ]

expected = 
  implimentation:
    add: [
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'FIRST_VALUE'
      ]
    ]
    edit: [
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'EDITED_VALUE'
      ]
    ]
    read: [
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'FIRST_VALUE'
      ]
    ]
    list: [
      requirements: [
        name: 'FIRST_REQUIREMENT'
        value: 'FIRST_VALUE'
      ]
    ]
    remove: []



# UTILITIES AND TESTS

doOperation = (cb) ->
  url = "#{base}/implimentations"
  if @operation is 'add' then method = 'post'
  if @operation is 'edit'
    method = 'put' 
    url += "/#{@updateId}"
  if @operation is 'read' 
    method = 'get'
    url += "/#{@updateId}"
  if @operation is 'list' then return cb null
  if @operation is 'remove'
    method = 'del'
    url += "/#{@updateId}"
  req = @owner[method] url
  req.set 'runnable-token', @ownerToken
  if @operation is 'add' then req.send _.extend data.implimentation.add,
    specification: @specificationId
  if @operation is 'edit' then req.send data.implimentation.edit
  req.end (err, res) =>
    if res?.status is 403 then err = new Error 'forbiden'
    if res?.status is 404 then err = new Error 'not found'
    if err then cb err else cb null

checkOperation = (cb) ->
  req = @owner.get "#{base}/implimentations"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.body.length.should.equal expected.implimentation[@operation].length
      expected.implimentation[@operation].every (implimentation, i) =>
        implimentation.requirements.every (requirement, j) =>
          requirement.name.should.equal res.body[i].requirements[j].name
          requirement.value.should.equal res.body[i].requirements[j].value
          return true
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
      @image = res.body
      cb null

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
  req = @moderator.post "#{base}/token"
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

createSpecification = (cb) ->
  req = @owner.post "#{base}/specifications"
  req.set 'runnable-token', @ownerToken
  req.send data.specification.create
  req.end (err, res) =>
    if res.status is 404 then err = new Error "specification route not found"
    @specificationId = res.body._id 
    if err then cb err else cb null

createImplimentation = (cb) ->
  req = @owner.post "#{base}/implimentations"
  req.set 'runnable-token', @ownerToken
  req.send _.extend data.implimentation.create,
    specification: @specificationId
  req.end (err, res) =>
    if res.status is 404 then err = new Error "implimentation route not found"
    @updateId = res.body._id 
    if err then cb err else cb null

createImage = (cb) ->
  req = @owner.post "#{base}/runnables"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @imageId = res.body._id
      cb null

createContainer = (cb) ->
  req = @owner.post "#{base}/users/me/runnables?from=#{@imageId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @containerId = res.body._id
      @token = res.body.token
      @container = res.body
      cb null

attachContainer = (cb) ->
  @container.specification = @specificationId
  user = @user or @moderator or @owner
  req = user.put "#{base}/users/me/runnables/#{@containerId}"
  req.set 'runnable-token', @userToken or @moderatorToken or @ownerToken
  req.send @container
  req.end (err, res) =>
    if res?.status is 400 then err = new Error 'not allowed'
    if res?.status is 403 then err = new Error 'forbidden'
    if res?.status is 404 then err = new Error "not found"
    if err && @success then cb err 
    else if err && not @success then cb null
    else if not @success then cb new Error 'should not have succeeded'
    else
     cb null

# TEST CONTROLLERS

prepContainer = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    createSpecification.bind @
    createImage.bind @
    createContainer.bind @
    attachContainer.bind @
  ]
  async.series list, cb 

prepImage = (cb) ->
  list = [
    prepContainer.bind @
    deleteImage.bind @
    recreateImage.bind @
  ]
  async.series list, cb

testCrud = (cb) ->
  list = [
    prepImage.bind @
  ]
  if @operation isnt 'add'
    list.push createImplimentation.bind @
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
  
  it 'should allow owners to create ::implimentations',
    testCrud.bind
      userType: 'owner'
      operation: 'add'
      success: true
  it 'should allow owners to edit ::implimentations',
    testCrud.bind
      userType: 'owner'
      operation: 'edit'
      success: true
  it 'should allow owners to view ::implimentations',
    testCrud.bind
      userType: 'owner'
      operation: 'read'
      success: true
  it 'should allow owners to list ::implimentations',
    testCrud.bind
      userType: 'owner'
      operation: 'list'
      success: true
  it 'should allow owners to remove ::implimentations',
    testCrud.bind
      userType: 'owner'
      operation: 'remove'
      success: true

  it 'should allow moderators to create ::implimentations',
    testCrud.bind
      userType: 'moderator'
      operation: 'add'
      success: true
  it 'should allow moderators to edit ::implimentations',
    testCrud.bind
      userType: 'moderator'
      operation: 'edit'
      success: true
  it 'should allow moderators to view ::implimentations',
    testCrud.bind
      userType: 'moderator'
      operation: 'read'
      success: true
  it 'should allow moderators to list ::implimentations',
    testCrud.bind
      userType: 'moderator'
      operation: 'list'
      success: true
  it 'should allow moderators to remove ::implimentations',
    testCrud.bind
      userType: 'moderator'
      operation: 'remove'
      success: true

  it 'should forbid non-owners/moderators to create ::implimentations',
    testCrud.bind
      userType: 'non-owner'
      operation: 'add'
      success: false
  it 'should forbid non-owners/moderators to edit ::implimentations', ->
    testCrud.bind
      userType: 'non-owner'
      operation: 'edit'
      success: false
  it 'should forbid non-owners/moderators to view ::implimentations', ->
    testCrud.bind
      userType: 'non-owner'
      operation: 'read'
      success: false
  it 'should forbid non-owners/moderators to list ::implimentations', ->
    testCrud.bind
      userType: 'non-owner'
      operation: 'list'
      success: false
  it 'should forbid non-owners/moderators to remove ::implimentations', ->
    testCrud.bind
      userType: 'non-owner'
      operation: 'remove'
      success: false

  it 'should allow container start with ::implimentations', ->
    testStart.bind
      with: true
      success: true
  it 'should forbid container start without ::implimentations', ->
    testStart.bind
      with: false
      success: false

  it 'should cause the web page to use the ::implimentations url', ->
    testUrl.bind {}

  it 'should have existing ::implimentations env variables set', ->
    testVariables.bind
      existing: true
  it 'should set ::implimentations env variables on demand', ->
    testVariables.bind
      existing: false
  