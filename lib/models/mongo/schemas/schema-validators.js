'use strict';
var validate = require('mongoose-validator');
var clone = require('101/clone');

var STANDARD_LENGTH = 100;
var EXTENDED_LENGTH = 200;
var FULL_LENGTH = 500;

var getCharacterMaxString = function (max) {
  return " should be between 1 and " + max + " characters.";
};
var S_INVALID_CHARACTERS = " contains invalid characters.";
var S_INVALID_OBJECT_ID = " contains an invalid ObjectId.";
var S_INVALID_EMAIL = " does not contain a valid email address.";
var S_INVALID_URL = " does not contain a valid URL.";
var S_INVALID_DOCK_ID = "'s Docker Container Id is invalid.";
var S_INVALID_DOCK_HOST = "'s Docker Host URL is invalid.";
var S_INVALID_TOKEN = "'s Docker Host URL is invalid.";
var S_AFTER_NOW = " is in the future, but shouldn't be";

var messages = {
  characters: S_INVALID_CHARACTERS,
  objectId: S_INVALID_OBJECT_ID,
  email: S_INVALID_EMAIL,
  dockerId: S_INVALID_DOCK_ID,
  dockerHost: S_INVALID_DOCK_HOST,
  url: S_INVALID_URL,
  token: S_INVALID_TOKEN,
  beforeNow: S_AFTER_NOW,
  stringLength: getCharacterMaxString
};

module.exports.validationMessages = messages;

function lengthCheck (input) {
  input = clone(input);
  input.message = input.model + "'s " + input.literal + input.lengthCheck;
  input.arguments = [1, input.maxLength];
  input.validator = 'isLength';
  return validate(input);
}
function invalidCheck (input) {
  input.message = input.model + "'s " + input.literal + input.invalidCheck;
  return validate(input);
}

/**
 * Common Validators contain common validations used between the various schema models, as well
 * as helper function wrappers to generate validation error messages.  These wrappers take in an
 * input object that should resemble this
 *
 * input {
 *   model: The model object
 *   literal: The literal that called the tester
 * }
 *
 * @type {{name: name, email: email, alphaNumName: alphaNumName, description: description,
 * urlSafe: urlSafe, dockerId: dockerId, objectId: objectId, dockerHost: dockerHost}}
 */
module.exports.commonValidators = {
  githubOwnerAndRepo: function (input) {
    input.maxLength = STANDARD_LENGTH;
    input.lengthCheck = getCharacterMaxString(STANDARD_LENGTH);
    input.invalidCheck = S_INVALID_CHARACTERS;
    input.validator = 'matches';
    input.arguments = [ /^\w+\/\w+$/ ];
    return [invalidCheck(input), lengthCheck(input)];
  },
  gitCommit: function (input) {
    input.maxLength = STANDARD_LENGTH;
    input.lengthCheck = getCharacterMaxString(STANDARD_LENGTH);
    input.invalidCheck = S_INVALID_CHARACTERS;
    input.validator = 'matches';
    input.arguments = [ /^[0-9a-f]{5,40}$/ ];
    return [invalidCheck(input), lengthCheck(input)];
  },
  // Name is used for real-world names, like that of a user or a company.  This shouldn't be used
  // for any internal component's name
  name: function (input) {
    input.maxLength = STANDARD_LENGTH;
    input.lengthCheck = getCharacterMaxString(STANDARD_LENGTH);
    input.invalidCheck = S_INVALID_CHARACTERS;
    input.validator = 'matches';
    input.arguments = [ /^[\w\d '\-]+$/, 'gm'];
    return [invalidCheck(input), lengthCheck(input)];
  },
  email : function (input) {
    input.maxLength = EXTENDED_LENGTH;
    input.lengthCheck = getCharacterMaxString(EXTENDED_LENGTH);
    input.invalidCheck = S_INVALID_EMAIL;
    input.validator = 'isEmail';
    return [invalidCheck(input), lengthCheck(input)];
  },
  alphaNumName : function (input) {
    input.maxLength = STANDARD_LENGTH;
    input.lengthCheck = getCharacterMaxString(STANDARD_LENGTH);
    input.invalidCheck = S_INVALID_CHARACTERS;
    input.validator = 'matches';
    input.arguments = [ /^[\w\d \-]+$/, 'gm'];
    return [invalidCheck(input), lengthCheck(input)];
  },
  description : function (input) {
    input.maxLength = FULL_LENGTH;
    input.lengthCheck = getCharacterMaxString(FULL_LENGTH);
    input.passIfEmpty = true;
    return lengthCheck(input);
  },
  stringLengthValidator: function(input, length) {
    input.maxLength = length;
    input.lengthCheck = getCharacterMaxString(length);
    input.passIfEmpty = true;
    return lengthCheck(input);
  },
  urlSafe : function (input) {
    input.maxLength = STANDARD_LENGTH;
    input.lengthCheck = getCharacterMaxString(STANDARD_LENGTH);
    input.invalidCheck = S_INVALID_CHARACTERS;
    input.validator = 'matches';
    input.arguments = [ /^[\w\d_\-]+$/, 'gm'];
    return [invalidCheck(input), lengthCheck(input)];
  },
  dockerId : function (input) {
    input.maxLength = 100;
    input.invalidCheck = "The " + input.model + S_INVALID_DOCK_ID;
    input.validator = 'isHexadecimal';
    input.lengthCheck = input.invalidCheck;
    return [invalidCheck(input), lengthCheck(input)];
  },
  objectId : function (input) {
    input.maxLength = 24;
    input.lengthCheck = getCharacterMaxString(24);
    input.invalidCheck = S_INVALID_OBJECT_ID;
    input.validator = 'isHexadecimal';
    return [invalidCheck(input), lengthCheck(input)];
  },
  dockerHost : function (input) {
    input.invalidCheck = "The " + input.model + S_INVALID_DOCK_HOST;
    input.validator = 'isURL';
    return invalidCheck(input);
  },
  url: function (input) {
    input.maxLength = EXTENDED_LENGTH;
    input.lengthCheck = getCharacterMaxString(EXTENDED_LENGTH);
    input.invalidCheck = S_INVALID_URL;
    input.validator = 'isURL';
    return [invalidCheck(input), lengthCheck(input)];
  },
  token: function (input) {
    input.maxLength = STANDARD_LENGTH;
    input.lengthCheck = S_INVALID_TOKEN;
    input.invalidCheck = S_INVALID_TOKEN;
    input.validator = 'isHexadecimal';
    return [invalidCheck(input), lengthCheck(input)];
  },
  beforeNow: function (input) {
    input.invalidCheck = S_AFTER_NOW;
    input.validator = 'isBefore';
    return invalidCheck(input);
  }

};
