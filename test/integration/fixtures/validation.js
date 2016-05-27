'use strict'

var Code = require('code')
var expect = Code.expect

var Faker = require('faker')
var schemaValidators = require('models/mongo/schemas/schema-validators')
var keypath = require('keypather')()

var OBJECT_ID = '507c7f79bcf86cd7994f6c0e'
var GITHUB_ID = 1
var VALIDATOR_ERROR = 'ValidationError'
var NOT_URL_SAFE = [Faker.Internet.email(), Faker.Lorem.sentence(), '4t523456&^()*&^)*&^)*(&^)*&^']
var URL_SAFE = [String(Faker.Internet.userName()).replace(/[^\w\d]/g, '_'),
  Faker.Name.firstName(), OBJECT_ID]
var ALPHA_NUM_SAFE = [
  Faker.Name.firstName(),
  OBJECT_ID,
  'Container-123',
  'this-is-my-container'
]
var ALPHA_NUM_W_SPACE_SAFE = [
  Faker.Name.firstName(),
  OBJECT_ID,
  'Container-123',
  'this-is-my-container',
  'Container 123'
]
var NOT_ALPHA_NUM_SAFE = [
  'spaced name',
  Faker.Internet.email(),
  Faker.Image.imageUrl(),
  Faker.Internet.ip()
]
var NOT_ALPHA_NUM_W_SPACE_SAFE = [
  Faker.Internet.email(),
  Faker.Image.imageUrl(),
  Faker.Internet.ip()
]
var URLS = [Faker.Image.imageUrl(), 'http://www.google.com',
  'http://my_bucket.s3.amazonaws.com/homepage.html']

var Validator = function (lab) {
  this.lab = lab
}

module.exports = function (lab) { return new Validator(lab) }

Validator.prototype.githubUserRefValidationChecking = function (createModelFunction, property, isList) {
  var self = this

  var path = require('path')
  var moduleName = path.relative(process.cwd(), __filename)

  self.lab.describe('Github User Ref Validation: ' + moduleName, function () {
    var word = self.makeStringOfLength(50)
    self.lab.it('should fail validation for an invalid Github User Id (' + word + ')', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, word)
      myObject.save(function (err) {
        expect(err).to.exist()
        expect(err.name).to.exist()
        expect(err.name).to.match(/(Validation|Cast)Error/)
        done()
      })
    })
    self.lab.it(property + ' should succeed validation for a valid Github User Id', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [GITHUB_ID] : GITHUB_ID)
      self.successCheck(myObject, done, property)
    })
  })
}

Validator.prototype.tokenValidationChecking = function (createModelFunction, property, isList) {
  var self = this
  self.lab.describe('ObjectId Validation', function () {
    var word = self.makeStringOfLength(101)
    self.lab.it('should fail validation for an invalid Token (' + word + ')', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [word] : word)
      myObject.save(function (err) {
        expect(err).to.exist()
        expect(err.name).to.exist()
        expect(err.name).to.equal('CastError')
        done()
      })
    })
    self.lab.it(property + ' should succeed validation for a valid Token', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [OBJECT_ID] : OBJECT_ID)
      self.successCheck(myObject, done, property)
    })
  })
}

Validator.prototype.emailValidationChecking = function (createModelFunction, property, isList) {
  var self = this
  self.lab.describe('Email Validation', function () {
    ALPHA_NUM_SAFE.forEach(function (string) {
      self.lab.it('should fail validation for ' + string, function (done) {
        var myObject = createModelFunction()
        self.fixArrayKeypathSet(myObject, property, isList ? [string] : string)
        self.errorCheck(myObject, done, property, schemaValidators.validationMessages.email)
      })
    })
    var validEmail = Faker.Internet.email()
    self.lab.it('should pass validation for a valid email (' + validEmail + ')', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [validEmail] : validEmail)
      self.successCheck(myObject, done, property)
    })
  })
}

Validator.prototype.objectIdValidationChecking = function (createModelFunction, property, isList) {
  var self = this
  self.lab.describe('ObjectId Validation', function () {
    var word = self.makeStringOfLength(50)
    self.lab.it('should fail validation for an invalid ObjectId (' + word + ')', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [word] : word)
      myObject.save(function (err) {
        expect(err).to.exist()
        expect(err.name).to.exist()
        expect(err.name).to.equal('CastError')
        done()
      })
    })
    self.lab.it(property + ' should succeed validation for a valid ObjectId', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [OBJECT_ID] : OBJECT_ID)
      self.successCheck(myObject, done, property)
    })
  })
}

Validator.prototype.dockerIdValidationChecking = function (createModelFunction, property, isList) {
  var self = this
  self.lab.describe('Docker Id Validation', function () {
    var word = self.makeStringOfLength(200)
    self.lab.it('should fail validation for an invalid Docker Id (' + word + ')', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [word] : word)
      myObject.save(function (err) {
        expect(err).to.exist()
        expect(err.name).to.exist()
        expect(err.name).to.equal(VALIDATOR_ERROR)
        done()
      })
    })
    self.lab.it('should succeed validation for a valid Docker Id', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, isList ? [OBJECT_ID] : OBJECT_ID)
      self.successCheck(myObject, done, property)
    })
  })
}

Validator.prototype.stringLengthValidationChecking = function (createModelFunction, property, maxLength) {
  var self = this
  var word = self.makeStringOfLength(maxLength)
  self.lab.describe('Length Validation', function () {
    self.lab.it('should succeed length validation for a string of length ' + maxLength, function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, word)
      self.successCheck(myObject, done, property)
    })
    self.lab.it('should fail length validation for a string of length ' + (maxLength + 1), function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathSet(myObject, property, word + 'a')
      self.errorCheck(myObject, done, property,
        schemaValidators.validationMessages.stringLength(maxLength))
    })
  })
}

Validator.prototype.urlValidationChecking = function (createModelFunction, property, validationMessage) {
  var self = this
  self.lab.describe('URL Validation', function () {
    ALPHA_NUM_SAFE.forEach(function (string) {
      self.lab.it('should fail validation for ' + string, function (done) {
        var container = createModelFunction()
        self.fixArrayKeypathSet(container, property, string)
        self.errorCheck(container, done, property, validationMessage)
      })
    })
    URLS.forEach(function (string) {
      self.lab.it('should succeed validation for ' + string, function (done) {
        var container = createModelFunction()
        self.fixArrayKeypathSet(container, property, string)
        self.successCheck(container, done, property)
      })
    })
  })
}

Validator.prototype.urlSafeNameValidationChecking = function (createModelFunction, property, validationMessage) {
  var self = this
  self.lab.describe('Url-Safe Validation', function () {
    NOT_URL_SAFE.forEach(function (string) {
      self.lab.it('should fail validation for ' + string, function (done) {
        var model = createModelFunction()
        self.fixArrayKeypathSet(model, property, string)
        self.errorCheck(model, done, property, validationMessage)
      })
    })
    URL_SAFE.forEach(function (string) {
      self.lab.it('should succeed validation for ' + string, function (done) {
        var model = createModelFunction()
        self.fixArrayKeypathSet(model, property, string)
        self.successCheck(model, done, property)
      })
    })
  })
}

Validator.prototype.alphaNumNameValidationChecking = function (createModelFunction, property) {
  var self = this
  self.lab.describe('Alphanumic Validation', function () {
    NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      self.lab.it('should fail validation for ' + string, function (done) {
        var model = createModelFunction()
        self.fixArrayKeypathSet(model, property, string)
        self.errorCheck(model, done, property, schemaValidators.validationMessages.characters)
      })
    })
    ALPHA_NUM_SAFE.forEach(function (string) {
      self.lab.it('should succeed validation for ' + string, function (done) {
        var model = createModelFunction()
        self.fixArrayKeypathSet(model, property, string)
        self.successCheck(model, done, property)
      })
    })

    self.stringLengthValidationChecking(createModelFunction, property, 100)
  })
}

Validator.prototype.nameValidationChecking = function (createModelFunction, property) {
  var self = this
  self.lab.describe('Name Validation', function () {
    self.stringLengthValidationChecking(createModelFunction, property, 100)
  })
}

Validator.prototype.requiredValidationChecking = function (createModelFunction, property) {
  var self = this
  self.lab.describe(property + ' Required Validation', function () {
    self.lab.it(property + ' should fail validation because it is required', function (done) {
      var myObject = createModelFunction()
      self.fixArrayKeypathDel(myObject, property)
      self.requiredCheck(myObject, done, property)
    })
  })
}

Validator.prototype.fixArrayKeypathSet = function (myObject, property, value) {
  if (property.indexOf('.') < 0) {
    myObject[property] = value
  } else if (property.match(/\.\d+\./)) {
    var paths = property.split('.')
    var finalPath = myObject
    for (var i = 0; i < paths.length - 1; i++) {
      paths[i] = isNaN(paths[i]) ? paths[i] : parseInt(paths[i], 10)
      finalPath = finalPath[paths[i]]
    }
    finalPath[paths[paths.length - 1]] = value
  } else {
    property = property.replace(/\.(\d+)\./g, '[$1]')
    keypath.set(myObject, property, value)
  }
}

Validator.prototype.fixArrayKeypathDel = function (myObject, property, value) {
  if (property.indexOf('.') < 0) {
    myObject[property] = value
  } else if (property.match(/\.\d+\./)) {
    var paths = property.split('.')
    var finalPath = myObject
    for (var i = 0; i < paths.length - 1; i++) {
      paths[i] = isNaN(paths[i]) ? paths[i] : parseInt(paths[i], 10)
      finalPath = finalPath[paths[i]]
    }
    finalPath[paths[paths.length - 1]] = value
  } else {
    keypath.del(myObject, property)
  }
}

Validator.prototype.errorCheck = function (modelObject, done, property, validationString) {
  modelObject.save(function (err, model) {
    expect(model).to.not.exist()
    expect(err).to.exist()
    expect(err.name).to.exist()
    expect(err.name).to.equal(VALIDATOR_ERROR)
    expect(err.errors).to.exist()
    if (err.errors.hasOwnProperty(property)) {
      var errorValue = err.errors[property]
      expect(errorValue.value).to.exist()
      expect(errorValue.value).to.equal(keypath.get(modelObject, property))
      expect(errorValue.message).to.contain(validationString)
    } else {
      done(new Error('The ' + (typeof modelObject) + ' failed to catch a ' + property +
        ' validation'))
    }
    done()
  })
}

Validator.prototype.requiredCheck = function (modelObject, done, property) {
  modelObject.save(function (err) {
    expect(err).to.exist()
    expect(err.name).to.exist()
    expect(err.name).to.equal(VALIDATOR_ERROR)
    expect(err.errors).to.exist()
    if (err.errors.hasOwnProperty(property)) {
      var errorValue = err.errors[property]
      expect(errorValue.message).to.contain('require')
    } else {
      done(new Error('The ' + (typeof modelObject) + ' failed to catch a ' + property +
        ' validation'))
    }
    done()
  })
}

Validator.prototype.successCheck = function (modelObject, done, property) {
  modelObject.save(function (err, savedModel) {
    if (err) {
      return done(err)
    }
    expect(err).to.not.exist()
    expect(savedModel).to.exist()
    expect(keypath.get(savedModel, property)).to.exist()
    expect(keypath.get(savedModel, property)).to.equal(keypath.get(modelObject, property))
    done()
  })
}

Validator.prototype.makeStringOfLength = function (length) {
  var returnValue = ''
  for (var x = 0; x < length; x++) {
    returnValue += 'a'
  }
  return returnValue
}

Validator.prototype.VALID_OBJECT_ID = OBJECT_ID
Validator.prototype.VALID_GITHUB_ID = GITHUB_ID
Validator.prototype.NOT_URL_SAFE = NOT_URL_SAFE
Validator.prototype.NOT_ALPHA_NUM_W_SPACE_SAFE = NOT_ALPHA_NUM_W_SPACE_SAFE
Validator.prototype.ALPHA_NUM_W_SPACE_SAFE = ALPHA_NUM_W_SPACE_SAFE
Validator.prototype.URL_SAFE = URL_SAFE
Validator.prototype.ALPHA_NUM_SAFE = ALPHA_NUM_SAFE
Validator.prototype.NOT_ALPHA_NUM_SAFE = NOT_ALPHA_NUM_SAFE
Validator.prototype.URLS = URLS
