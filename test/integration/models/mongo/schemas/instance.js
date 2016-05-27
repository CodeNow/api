'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach

var validation = require('../../../fixtures/validation')(lab)
var schemaValidators = require('models/mongo/schemas/schema-validators')

var mongoFactory = require('../../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')

var Instance = require('models/mongo/instance')

describe('Instance Schema Integration Tests', function () {
  before(mongooseControl.start)

  afterEach(function (done) {
    Instance.remove({}, done)
  })

  after(function (done) {
    Instance.remove({}, done)
  })
  after(mongooseControl.stop)

  describe('Name Validation', function () {
    validation.NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var instance = mongoFactory.createNewInstance()
        instance.name = string
        validation.errorCheck(
          instance,
          done,
          'name',
          schemaValidators.validationMessages.characters)
      })
    })
    validation.ALPHA_NUM_SAFE.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var instance = mongoFactory.createNewInstance()
        instance.name = string
        validation.successCheck(instance, done, 'name')
      })
    })
    validation.stringLengthValidationChecking(mongoFactory.createNewInstance, 'name', 100)
    validation.requiredValidationChecking(mongoFactory.createNewInstance, 'name')
  })

  describe('Github Owner Id Validation', function () {
    validation.githubUserRefValidationChecking(mongoFactory.createNewInstance, 'owner.github')
    validation.requiredValidationChecking(mongoFactory.createNewInstance, 'owner')
  })

  describe('Github CreatedBy Validation', function () {
    validation.githubUserRefValidationChecking(mongoFactory.createNewInstance, 'createdBy.github')
    validation.requiredValidationChecking(mongoFactory.createNewInstance, 'createdBy')
  })

  describe('Isolated Validation', function () {
    validation.objectIdValidationChecking(mongoFactory.createNewInstance, 'isolated')
  })
})
