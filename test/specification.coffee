configs = require '../lib/configs'
helpers = require './helpers'
_ = require 'lodash'
sa = require 'superagent'
async = require 'async'

# CONFIG

base = "http://localhost:#{configs.port}"

data = 
  user:
    create:
      name: 'name1'
      description: 'first spec'
      instructions: 'fill me in bro'
      requirements: [
        'FIRST_REQUIREMENT'
      ]
  specification:
    add:
      name: 'name2'
      description: 'second spec'
      instructions: 'fill me in bro'
      requirements: [
        'SECOND_REQUIREMENT'
      ]
    edit:
      description: 'edited spec'
      instructions: 'fill me in bro'
      requirements: [
        'EDITED_REQUIREMENT'
      ]

expected =
  specification:
    add: [ 
      {
        instructions: 'fill me in bro',
        description: 'first spec',
        name: 'name1',
        requirements: [ 'FIRST_REQUIREMENT' ]
      }
      { 
        instructions: 'fill me in bro',
        description: 'second spec',
        name: 'name2',
        requirements: [ 'SECOND_REQUIREMENT' ] 
      }
    ]
    edit: [
      name: 'name1',
      description: 'edited spec'
      instructions: 'fill me in bro'
      requirements: [
        'EDITED_REQUIREMENT'
      ]
    ]
    remove: []
    view: [
      name: 'name1'
      description: 'first spec'
      instructions: 'fill me in bro'
      requirements: [
        'FIRST_REQUIREMENT'
      ]
    ]

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

initOwner = (cb) ->
  req = @owner.post "#{base}/specifications"
  req.set 'runnable-token', @ownerToken
  req.send data.user.create
  req.end (err, res) =>
    if res.status is 404 then err = new Error "init route not found"
    @updateId = res.body._id 
    if err then cb err else cb null

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

createImage = (cb) ->
  req = @owner.post "#{base}/runnables"
  req.set 'runnable-token', @ownerToken
  req.end (err, res) =>
    if err then cb err else
      res.should.have.status 201
      @imageId = res.body._id
      cb null

initImage = (cb) ->
  req = @owner.post "#{base}/runnables/#{@imageId}/#{@type}"
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

doOperation = (cb) ->
  url = "#{base}/specifications"
  if @operation is 'add' then method = 'post'
  if @operation is 'edit' 
    method = 'put' 
    url += "/#{@updateId}"
  if @operation is 'read' then return cb null
  if @operation is 'remove' 
    method = 'del'  
    url += "/#{@updateId}"
  user = @user or @moderator or @owner
  req = user[method] url
  req.set 'runnable-token', @userToken or @moderatorToken or @ownerToken
  if @operation is 'add' then req.send data.specification[@operation]
  if @operation is 'edit' then req.send data.specification[@operation]
  req.end (err, res) =>
    if res?.status is 403 then err = new Error 'forbidden'
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
    user = @user or @moderator or @owner
    req = user.get "#{base}/specifications"
    req.set 'runnable-token', @userToken or @moderatorToken or @ownerToken
    req.end (err, res) =>
      if res?.status is 403 then err = new Error 'forbiden'
      if res?.status is 404 then err = new Error 'not found'
      if err then cb err else
        results = res.body.map (specification) ->
          delete specification._id
          delete specification.__v
          delete specification.owner
          return specification
        if not _.isEqual results, expected.specification[@operation]
          throw new Error 'results dont\'t match'
        cb null

attachImage = (cb) ->
  user = @user or @moderator or @owner
  req = user.put "#{base}/runnables/#{@imageId}"
  req.set 'runnable-token', @userToken or @moderatorToken or @ownerToken
  req.end (err, res) =>
    if res?.status is 403 then err = new Error 'forbidden'
    if res?.status is 404 then err = new Error "not found"
    if err && @success then cb err 
    else if err && not @success then cb null
    else if not @success then cb new Error 'should not have succeeded'
    else
     cb null

tryStomp = (cb) ->
  req = @owner.post "#{base}/runnables/#{@imageId}/#{@type}"
  req.set 'runnable-token', @ownerToken
  req.send data[@type].create
  req.end (err, res) =>
    if res?.status is 409 then err = new Error 'conflict'
    if not err then cb new Error 'should not have succeeded' else
      cb null

stopServer = (cb) ->
  @instance.configs.passwordSalt = @oldSalt
  @instance.stop cb

# TEST CONTROLLERS

testCrud = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    initOwner.bind @
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

testAttach = (cb) ->
  list = [
    createServer.bind @
    createOwner.bind @
    initOwner.bind @
    createImage.bind @
  ]
  if @operation is 'edit'
    list.push initImage.bind @
  if @userType is 'moderator'
    list.push createModerator.bind @
  if @userType is 'non-owner'
    list.push createUser.bind @
  list = list.concat [
    attachImage.bind @
    #checkImage.bind @
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

# DESCRIPTION

describe 'specification api', ->
  
  it 'should allow publishers to create ::specifications',
    testCrud.bind
      userType: 'publisher'
      operation: 'add'
      success: true
  it 'should forbid non-publishers from creating ::specifications',
    testCrud.bind
      userType: 'non-owner'
      operation: 'add'
      success: false

  it 'should allow specification owners to edit ::specifications',
    testCrud.bind
      userType: 'publisher'
      operation: 'edit'
      success: true
  it 'should allow specification moderators to edit ::specifications',
    testCrud.bind
      userType: 'moderator'
      operation: 'edit'
      success: true
  it 'should forbid non-owners from editing ::specifications',
    testCrud.bind
      userType: 'non-owner'
      operation: 'edit'
      success: false

  it 'should allow specification owners to remove ::specifications',
    testCrud.bind
      userType: 'publisher'
      operation: 'remove'
      success: true
  it 'should allow specification moderators to remove ::specifications',
    testCrud.bind
      userType: 'moderator'
      operation: 'remove'
      success: true
  it 'should forbid non-owners from removing ::specifications',
    testCrud.bind
      userType: 'non-owner'
      operation: 'remove'
      success: false

  it 'should allow owners to read ::specifications',
    testCrud.bind
      userType: 'publisher'
      operation: 'read'
      success: false
  it 'should allow non-owners to read ::specifications',
    testCrud.bind
      userType: 'non-owner'
      operation: 'read'
      success: false

  it 'should allow publishers to attach a ::specifications to a container',
    testAttach.bind
      userType: 'publisher'
      operation: 'add'
      success: true
  it 'should allow moderators to attach a ::specifications to a container', ->
    testAttach.bind
      userType: 'moderator'
      operation: 'add'
      success: true
  it 'should forbid non-owners from attaching a ::specifications to a container', ->
    testAttach.bind
      userType: 'non-owner'
      operation: 'add'
      success: false

  it 'should allow publishers to remove a ::specifications to a container', ->
    testAttach.bind
      userType: 'publisher'
      operation: 'remove'
      success: true
  it 'should allow moderators to remove a ::specifications to a container', ->
    testAttach.bind
      userType: 'moderator'
      operation: 'remove'
      success: true
  it 'should forbid non-owners from removing a ::specifications to a container', ->
    testAttach.bind
      userType: 'non-owner'
      operation: 'remove'
      success: false

  it 'should allow publishers to swap out the ::specifications of a container', ->
    testAttach.bind
      userType: 'publisher'
      operation: 'edit'
      success: true
  it 'should allow moderators to swap out the ::specifications of a container', ->
    testAttach.bind
      userType: 'moderator'
      operation: 'edit'
      success: true
  it 'should forbid non-owners from swaping out the ::specifications of a container', ->
    testAttach.bind
      userType: 'non-owner'
      operation: 'edit'
      success: false

  it 'should persist the ::specifications from an image to a container', ->
    testPersist.bind {}
  it 'should persist the ::specifications from a container to an image', ->
    testPersist.bind
      direction: 'backward'

  it 'should forbid duplicate ::specifications', ->
    testStomp.bind {}
