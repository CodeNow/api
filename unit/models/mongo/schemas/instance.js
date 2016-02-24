'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var afterEach = lab.afterEach

var validation = require('../../../fixtures/validation')(lab)
var schemaValidators = require('models/mongo/schemas/schema-validators')
var Hashids = require('hashids')

var Instance = require('models/mongo/instance')
var Version = require('models/mongo/context-version')
var mongoFactory = require('../../../factories/mongo')


var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Instance Schema Isolation Tests: ' + moduleName, function () {
  before(require('../../../fixtures/mongo').connect)
  afterEach(require('../../../../test/functional/fixtures/clean-mongo').removeEverything)

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

  describe('Isoalted Validation', function () {
    validation.objectIdValidationChecking(mongoFactory.createNewInstance, 'isolated')
  })
})
