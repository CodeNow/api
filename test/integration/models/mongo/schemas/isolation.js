'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach

var validation = require('../../../fixtures/validation')(lab)

var createNewIsolation = require('../../../fixtures/isolation-factory')
var mongooseControl = require('models/mongo/mongoose-control.js')

var Isolation = require('models/mongo/isolation')

describe('Isolation Schema Integration Tests', function () {
  before(mongooseControl.start)

  afterEach(function (done) {
    Isolation.remove({}, done)
  })

  after(function (done) {
    Isolation.remove({}, done)
  })
  after(mongooseControl.stop)
  describe('Owner Github ID Validation', function () {
    validation.githubUserRefValidationChecking(createNewIsolation, 'owner.github')
  })
})
