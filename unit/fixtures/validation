var Lab = require('lab');
var Faker = require('faker');
var it = Lab.test;
var expect = Lab.expect;
var describe = Lab.experiment;
var schemaValidators = require('../../lib/models/mongo/schemas/schema-validators');
var keypath = require('keypather')();

var OBJECT_ID = '507c7f79bcf86cd7994f6c0e';
var VALIDATOR_ERROR = 'ValidationError';
var NOT_URL_SAFE = [Faker.Internet.email(), Faker.Lorem.sentence(), '4t523456&^()*&^)*&^)*(&^)*&^'];
var URL_SAFE = [String(Faker.Internet.userName()).replace(/[^\w\d]/g ,'_'),
    Faker.Name.firstName(), OBJECT_ID];
var ALPHA_NUM_SAFE = [Faker.Name.firstName(), OBJECT_ID, Faker.Name.firstName() + " " + Faker.Name.lastName(),
  Faker.Lorem.sentence()];
var ALPHA_NUM_NOSPACE_SAFE = [Faker.Name.firstName(), OBJECT_ID];
var NOT_ALPHA_NUM_SAFE = [Faker.Internet.email(), Faker.Image.imageUrl() , Faker.Internet.ip()];
var URLS = [Faker.Image.imageUrl(), "http://www.google.com", "http://mybucket.s3.amazonaws.com/homepage.html"];


var objectIdValidationChecking = function(createModelFunction, property, isList) {
  describe('ObjectId Validation', function () {
    var word = makeStringOfLength(50);
    it('should fail validation for an invalid ObjectId (' + word + ')', function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathSet(myObject, property, isList ? [word] : word);
      myObject.save(function (err) {
        expect(err).to.be.ok;
        expect(err.name).to.be.ok;
        expect(err.name).to.equal("CastError");
        done();
      });
    });
    it(property + ' should succeed validation for a valid ObjectId', function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathSet(myObject, property, isList ? [OBJECT_ID] : OBJECT_ID);
      successCheck(myObject, done, property);
    });
  });
};

var dockerIdValidationChecking = function(createModelFunction, property, isList) {
  describe('Docker Id Validation', function () {
    var word = makeStringOfLength(200);
    it('should fail validation for an invalid Docker Id (' + word + ')', function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathSet(myObject, property, isList ? [word] : word);
      myObject.save(function (err) {
        expect(err).to.be.ok;
        expect(err.name).to.be.ok;
        expect(err.name).to.equal(VALIDATOR_ERROR);
        done();
      });
    });
    it('should succeed validation for a valid Docker Id', function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathSet(myObject, property, isList ? [OBJECT_ID] : OBJECT_ID);
      successCheck(myObject, done, property);
    });
  });
};

var stringLengthValidationChecking = function(createModelFunction, property, maxLength) {
  var word = makeStringOfLength(maxLength);
  describe('Length Validation', function () {
    it('should succeed length validation for a string of length ' + maxLength, function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathSet(myObject, property, word);
      successCheck(myObject, done, property);
    });
    it('should fail length validation for a string of length ' + (maxLength + 1), function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathSet(myObject, property, word + "a");
      errorCheck(myObject, done, property,
        schemaValidators.validationMessages.stringLength(maxLength));
    });
  });
};

var urlValidationChecking = function(createModelFunction, property, validationMessage) {
  describe('URL Validation', function () {
    ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var container = createModelFunction();
        fixArrayKeypathSet(container, property, string);
        errorCheck(container, done, property, validationMessage);
      });
    });
    URLS.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var container = createModelFunction();
        fixArrayKeypathSet(container, property, string);
        successCheck(container, done, property);
      });
    });
  });
};

var urlSafeNameValidationChecking = function(createModelFunction, property, validationMessage) {
  describe('Url-Safe Validation', function () {
    NOT_URL_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var container = createModelFunction();
        fixArrayKeypathSet(container, property, string);
        errorCheck(container, done, property, validationMessage);
      });
    });
    URL_SAFE.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var container = createModelFunction();
        fixArrayKeypathSet(container, property, string);
        successCheck(container, done, property);
      });
    });
  });
};

var alphaNumNameValidationChecking = function(createModelFunction, property) {
  describe('Alphanumic (with space) Validation', function () {
    NOT_ALPHA_NUM_SAFE.forEach(function (string) {
      it('should fail validation for ' + string, function (done) {
        var model = createModelFunction();
        fixArrayKeypathSet(model, property, string);
        errorCheck(model, done, property, schemaValidators.validationMessages.characters);
      });
    });
    ALPHA_NUM_SAFE.forEach(function (string) {
      it('should succeed validation for ' + string, function (done) {
        var model = createModelFunction();
        fixArrayKeypathSet(model, property, string);
        successCheck(model, done, property);
      });
    });

    stringLengthValidationChecking(createModelFunction, property, 100);
  });
}

var requiredValidationChecking = function(createModelFunction, property) {
  describe(property + ' Required Validation', function () {
    it(property + ' should fail validation because it is required', function (done) {
      var myObject = createModelFunction();
      fixArrayKeypathDel(myObject, property);
      requiredCheck(myObject, done, property);
    });
  });
};

var fixArrayKeypathSet = function(myObject, property, value) {
  if (property.indexOf('.') < 0) {
    myObject[property] = value;
  } else {
    if (property.match(/\.\d+\./)) {
      var paths = property.split('.');
      var finalPath = myObject;
      for (var i = 0; i < paths.length - 1; i ++ ) {
        if (! isNaN(paths[i])) {
          paths[i] = parseInt(paths[i])
        }
        finalPath = finalPath[paths[i]];
      }
      finalPath[paths[paths.length - 1]] = value;
    } else {
      keypath.set(myObject, property, value);
    }
  }
};

var fixArrayKeypathDel = function(myObject, property, value) {
  if (property.indexOf('.') < 0) {
    myObject[property] = value;
  } else {
    if (property.match(/\.\d+\./)) {
      var paths = property.split('.');
      var finalPath = myObject;
      for (var i = 0; i < paths.length - 1; i ++ ) {
        if (! isNaN(paths[i])) {
          paths[i] = parseInt(paths[i])
        }
        finalPath = finalPath[paths[i]];
      }
      finalPath[paths[paths.length - 1]] = value;
    } else {
      keypath.del(myObject, property);
    }
  }
};

var errorCheck = function (modelObject, done, property, validationString) {
  modelObject.save(function (err, object) {
    expect(err).to.be.ok;
    expect(err.name).to.be.ok;
    expect(err.name).to.equal(VALIDATOR_ERROR);
    expect(err.errors).to.be.ok;
    if (err.errors.hasOwnProperty(property)) {
      var errorValue = err.errors[property];
      expect(errorValue.value).to.be.ok;
      expect(errorValue.value).to.equal(keypath.get(modelObject,property));
      Lab.assert("The error received isn't the correct error",
          errorValue.message.indexOf(validationString) != -1);
    } else {
      done(new Error("The " + (typeof modelObject) + " failed to catch a " + property +
        " validation"));
    }
    done();
  });
};

var requiredCheck = function (modelObject, done, property) {
  modelObject.save(function (err, object) {
    expect(err).to.be.ok;
    expect(err.name).to.be.ok;
    expect(err.name).to.equal(VALIDATOR_ERROR);
    expect(err.errors).to.be.ok;
    if (err.errors.hasOwnProperty(property)) {
      var errorValue = err.errors[property];
      Lab.assert("The error received isn't the correct error",
          errorValue.message.indexOf("required") != -1);
    } else {
      done(new Error("The " + (typeof modelObject) + " failed to catch a " + property +
        " validation"));
    }
    done();
  });
};

var successCheck = function (modelObject, done, property) {
  modelObject.save(function (err, savedModel) {
    expect(err).to.not.be.ok;
    expect(savedModel).to.be.ok;
    expect(keypath.get(savedModel, property)).to.be.ok;
    expect(keypath.get(savedModel, property)).to.equal(keypath.get(modelObject, property));
    done();
  });
};

var makeStringOfLength = function(length) {
  var returnValue = '';
  for(var x = 0; x < length; x++) {
    returnValue += "a";
  }
  return returnValue;
};

module.exports.makeStringOfLength = makeStringOfLength;
module.exports.successCheck = successCheck;
module.exports.errorCheck = errorCheck;
module.exports.objectIdValidationChecking = objectIdValidationChecking;
module.exports.stringLengthValidationChecking = stringLengthValidationChecking;
module.exports.requiredValidationChecking = requiredValidationChecking;
module.exports.urlValidationChecking = urlValidationChecking;
module.exports.urlSafeNameValidationChecking = urlSafeNameValidationChecking;
module.exports.dockerIdValidationChecking = dockerIdValidationChecking;
module.exports.alphaNumNameValidationChecking = alphaNumNameValidationChecking;
module.exports.fixArrayKeypathSet = fixArrayKeypathSet;
module.exports.fixArrayKeypathDel = fixArrayKeypathDel;
module.exports.VALID_OBJECT_ID = OBJECT_ID;
module.exports.NOT_URL_SAFE = NOT_URL_SAFE;
module.exports.ALPHA_NUM_NOSPACE_SAFE = ALPHA_NUM_NOSPACE_SAFE;
module.exports.URL_SAFE = URL_SAFE;
module.exports.ALPHA_NUM_SAFE = ALPHA_NUM_SAFE;
module.exports.NOT_ALPHA_NUM_SAFE = NOT_ALPHA_NUM_SAFE;
module.exports.URLS = URLS;