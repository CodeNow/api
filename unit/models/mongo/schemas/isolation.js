'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var afterEach = lab.afterEach
var before = lab.before
var describe = lab.describe

var createNewIsolation = require('../../../factories/isolation')
var validation = require('../../../fixtures/validation')(lab)

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
describe('Isolation Schema Isolation Tests: ' + moduleName, function () {
  before(require('../../../fixtures/mongo').connect)
  afterEach(require('../../../../test/functional/fixtures/clean-mongo').removeEverything)

  describe('Owner Github ID Validation', function () {
    validation.githubUserRefValidationChecking(createNewIsolation, 'owner.github')
  })
})
