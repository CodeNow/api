/**
 * @module lib/models/mongo/schemas/app-code-version
 */
'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var validators = require('models/mongo/schemas/schema-validators').commonValidators;
/**
 * Appcode Versions are essentially repos.  This is where the repo information is stored
 * for each app.
 * @type {Schema}
 */
var AppCodeVersionSchema = module.exports = new Schema({
  // owner/repo
  repo: {
    type: String,
    validate: validators.githubOwnerAndRepo({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Repo'
    }),
    required: 'Version AppCodes require a Repo name'
  },
  lowerRepo: {
    type: String,
    index: true,
    validate: validators.githubOwnerAndRepo({
      model: 'ContextVersion',
      literal: 'AppCodeVersion lowerRepo'
    }),
    required: 'Version AppCodes require a Lower Repo name'
  },
  defaultBranch: {
    type: String
  },
  branch: {
    type: String,
    validate: validators.stringLengthValidator({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Branch'
    }, 200),
    required: 'Version AppCodes require a Branch'
  },
  lowerBranch: {
    type: String,
    validate: validators.stringLengthValidator({
      model: 'ContextVersion',
      literal: 'AppCodeVersion Branch'
    }, 200),
    index: true
  },
  commit: {
    type: String,
    index: true
  },
  updated: Boolean, // flag if version is new
  publicKey: String,
  privateKey: String,

  // transformation rules for find and replace
  transformRules: {
    exclude: [String],
    replace: [
      {
        action: String,
        search: String,
        replace: String,
        exclude: [String]
      }
    ],
    rename: [
      {
        action: String,
        source: String,
        dest: String
      }
    ]
  },
 /**
   * if defined or true this is not the main repo
   * @type {Boolean}
   */
  additionalRepo: {
    type: Boolean,
    sparse: true
  },
  /**
    * defines if this repo should always point to the latest commit
    * @type {Boolean}
    */
   useLatest: {
     type: Boolean,
     'default': false
   }
});

AppCodeVersionSchema.path('repo').set(function (repo) {
  this.lowerRepo = repo && repo.toLowerCase();
  return repo;
});
AppCodeVersionSchema.path('branch').set(function (branch) {
  this.lowerBranch = branch && branch.toLowerCase();
  return branch;
});
