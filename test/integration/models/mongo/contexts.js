'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var validation = require('../../fixtures/validation')(lab)
var mongooseControl = require('models/mongo/mongoose-control.js')

var schemaValidators = require('models/mongo/schemas/schema-validators')
var Context = require('models/mongo/context')

describe('Context Model Integration Tests', function () {
  before(mongooseControl.start)
  afterEach(function (done) {
    Context.remove({}, done)
  })

  after(function (done) {
    Context.remove({}, done)
  })
  after(mongooseControl.stop)

  function createNewContext () {
    return new Context({
      name: 'name',
      description: 'description',
      public: false,
      version: [validation.VALID_OBJECT_ID],
      owner: { github: validation.VALID_GITHUB_ID },
      source: [{
        sourceType: 'test',
        location: 'www.google.com'
      }],
      created: Date.now()
    })
  }

  it('should be able to save a context!', function (done) {
    var context = createNewContext()
    context.save(function (err, context) {
      if (err) {
        done(err)
      } else {
        expect(context).to.exist()
        done()
      }
    })
  })
  describe('Contexts Name Validation', function () {
    validation.urlSafeNameValidationChecking(createNewContext, 'name',
      schemaValidators.validationMessages.characters)
    validation.requiredValidationChecking(createNewContext, 'name')
  })

  describe('Context Github Owner User Id Validation', function () {
    validation.githubUserRefValidationChecking(createNewContext, 'owner.github')
  })

  describe('Contexts Description Validation', function () {
    validation.stringLengthValidationChecking(createNewContext, 'description', 500)
  })
})
