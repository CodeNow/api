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
  implementation:
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
  implementation:
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
  url = "#{base}/implementations"
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
  user = @user or @moderator or @owner
  req = user[method] url
  req.set 'runnable-token', @userToken or @moderatorToken or @ownerToken
  if @operation is 'add' then req.send _.extend data.implementation.add,
    specification: @specificationId
  if @operation is 'edit' then req.send data.implementation.edit
  req.end (err, res) =>
    if res?.status is 403 then err = new Error 'forbiden'
    if res?.status is 404 then err = new Error 'not found'
    if err && @success then cb err 
    else if err && not @success then cb null
    else if not @success then cb new Error 'should not have succeeded'
    else
     cb null

checkOperation = (cb) ->
  if not @success
    cb null
  else 
    user = @moderator or @owner
    req = user.get "#{base}/implementations"
    req.set 'runnable-token', @moderatorToken or @ownerToken
    req.end (err, res) =>
      if err then cb err else
        res.body.length.should.equal expected.implementation[@operation].length
        expected.implementation[@operation].every (implementation, i) =>
          implementation.requirements.every (requirement, j) =>
            requirement.name.should.equal res.body[i].requirements[j].name
            requirement.value.should.equal res.body[i].requirements[j].value
            return true
        cb null

checkEnv = (cb) ->
  termUrl = "http://#{@container.servicesToken}.runnableapp.dev/static/term.html"
  wakeup = @owner.get termUrl
  wakeup.end (err, res) =>
    helpers.sendCommand termUrl, 'env', (err, env) =>
      if err then cb err else
        if not /FIRST_REQUIREMENT/.test env 
          cb new Error 'env not set: ' + env
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

deleteContainer = (cb) ->
  req = @owner.del "#{base}/users/me/runnables/#{@containerId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 200
      cb null

recreateContainer = (cb) ->
  req = @owner.post "#{base}/users/me/runnables?from=#{@imageId}"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @containerId = res.body._id
      @container = res.body
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

createImplementation = (cb) ->
  req = @owner.post "#{base}/implementations"
  req.set 'runnable-token', @ownerToken
  req.send _.extend data.implementation.create,
    specification: @specificationId
    containerId: @containerId
  req.end (err, res) =>
    if res.status is 404 then err = new Error "implementation route not found"
    @updateId = res.body._id 
    @implementation = res.body;
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
    if err then cb err else
     cb null

startContainer = (cb) ->
  @container.running = true
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

checkUrl = (cb) ->
  url = "http://#{@implementation.subdomain}.runnableapp.dev"
  wake = @owner.get url
  wake.end (err, res) =>
    check = @owner.get url
    check.end (err, res) =>
      if /No Runnable Configured/.test res?.text
        cb new Error 'No Runnable Configured'
      else
        cb err

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
    list.push createImplementation.bind @
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
    prepContainer.bind @
  ]
  if @with 
    list.push createImplementation.bind @
  list = list.concat [
    startContainer.bind @
    stopServer.bind @
  ]
  async.series list, cb

testUrl = (cb) ->
  list = [
    prepImage.bind @
  ]
  if @existing
    list.push createImplementation.bind @
  list = list.concat [
    deleteContainer.bind @
    recreateContainer.bind @
  ]
  if not @existing
    list.push createImplementation.bind @
  list = list.concat [
    checkUrl.bind @
    stopServer.bind @
  ]
  async.series list, cb

testVariables = (cb) ->
  list = [
    prepImage.bind @
  ]
  if @existing
    list.push createImplementation.bind @
  list = list.concat [
    deleteContainer.bind @
    recreateContainer.bind @
  ]
  if not @existing
    list.push createImplementation.bind @
  list = list.concat [
    checkEnv.bind @
    stopServer.bind @
  ]
  async.series list, cb

# DESCRIPTION

describe 'implementation api', ->
  
  it 'should allow owners to create ::implementations',
    testCrud.bind
      userType: 'owner'
      operation: 'add'
      success: true
  it 'should allow owners to edit ::implementations',
    testCrud.bind
      userType: 'owner'
      operation: 'edit'
      success: true
  it 'should allow owners to view ::implementations',
    testCrud.bind
      userType: 'owner'
      operation: 'read'
      success: true
  it 'should allow owners to list ::implementations',
    testCrud.bind
      userType: 'owner'
      operation: 'list'
      success: true
  it 'should allow owners to remove ::implementations',
    testCrud.bind
      userType: 'owner'
      operation: 'remove'
      success: true

  it 'should allow moderators to edit ::implementations',
    testCrud.bind
      userType: 'moderator'
      operation: 'edit'
      success: true
  it 'should allow moderators to view ::implementations',
    testCrud.bind
      userType: 'moderator'
      operation: 'read'
      success: true
  it 'should allow moderators to list ::implementations',
    testCrud.bind
      userType: 'moderator'
      operation: 'list'
      success: true
  it 'should allow moderators to remove ::implementations',
    testCrud.bind
      userType: 'moderator'
      operation: 'remove'
      success: true

  it 'should forbid non-owners/moderators to edit ::implementations',
    testCrud.bind
      userType: 'non-owner'
      operation: 'edit'
      success: false
  it 'should forbid non-owners/moderators to view ::implementations',
    testCrud.bind
      userType: 'non-owner'
      operation: 'read'
      success: false
  it 'should forbid non-owners/moderators to list ::implementations',
    testCrud.bind
      userType: 'non-owner'
      operation: 'list'
      success: false
  it 'should forbid non-owners/moderators to remove ::implementations',
    testCrud.bind
      userType: 'non-owner'
      operation: 'remove'
      success: false

  it 'should allow container start with ::implementations',
    testStart.bind
      with: true
      success: true
  it 'should forbid container start without ::implementations',
    testStart.bind
      with: false
      success: false

  it 'should cause the web page to use the existing ::implementations url',
    testUrl.bind 
      existing: true
      success: true
  it 'should cause the web page to use the ::implementations url on demand',
    testUrl.bind
      existing: false
      success: true

  it 'should have existing ::implementations env variables set',
    testVariables.bind
      existing: true
      success: true
  it 'should set ::implementations env variables on demand',
    # this is the tricky one
    testVariables.bind
      existing: false
  