'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var isFunction = require('101/is-function');
var Boom = require('dat-middleware').Boom;
var pick = require('101/pick');
var async = require('async');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var mongoose = require('mongoose');
var Github = require('models/apis/github');
var debug = require('debug')('runnable-api:context-version:model');

var ContextVersionSchema = require('models/mongo/schemas/context-version');

/** Create a version for a context */
ContextVersionSchema.statics.createForContext = function (context, props, cb) {
  var ContextVersion = this;
  if (isFunction(props)) {
    cb = props;
    props = null;
  }
  props = props || {};
  var version = new ContextVersion({
    context: context._id,
    createdBy: context.owner,
    owner: context.owner
  });
  version.set(props);
  cb(null, version);
};

/** Copy a version to a new version! - user must be owner of old
 *  @params {object} body
 *  @params {ObjectId} body.versionId Version ID to copy from
 *  @params {ObjectId} ownerId Owner of the newly created version
 *  @params {function} callback
 *  @returns {object} New Version */
ContextVersionSchema.statics.findWithRepository = function (ownerName, repoName, cb) {
  var ContextVersion = this;
  var lowerRepo = (ownerName+'/'+repoName).toLowerCase();
  ContextVersion.find({
    'appCodeVersions.lowerRepo': lowerRepo
  }, cb);
};

var copyFields = [
  'appCodeVersion',
  'context',
  'dockerHost'
];
ContextVersionSchema.statics.createCopy = function (createdBy, version, cb) {
  version.createCopy(createdBy, cb);
};

ContextVersionSchema.methods.createCopy = function (createdBy, cb) {
  var version = this;
  var newVersion = new ContextVersion(pick(version, copyFields));
  newVersion.createdBy = createdBy;
  if (!version.infraCodeVersion) {
    cb(Boom.badImplementation('version is missing infraCodeVersion'));
  }
  else {
    InfraCodeVersion.createCopyById(version.infraCodeVersion, function (err, newInfraCodeVersion) {
      if (err) { return cb(err); }

      newVersion.infraCodeVersion = newInfraCodeVersion._id;
      newVersion.save(function (err, version) {
        if (err) {
          newInfraCodeVersion.remove(); // remove error handled below
        }
        cb(err, version);
      });
    });
  }
};

ContextVersionSchema.methods.updateBuildError = function (err, cb) {
  var contextVersion = this;
  contextVersion.update({
    $set: {
      'build.error.message': err.message,
      'build.error.stack': err.stack
    }
  }, cb);
};

ContextVersionSchema.methods.addGithubRepo = function (githubToken, repoInfo, cb) {
  debug('usertoken', githubToken);
  var container = this;
  var github = new Github({ token: githubToken });

  async.waterfall([
    github.createRepoHookIfNotAlready.bind(github, repoInfo.repo),
    function (hook, cb) {
      container._pushAppCodeVersion(repoInfo, cb);
    }
  ], cb);
};

ContextVersionSchema.methods._pushAppCodeVersion = function (appCodeVersion, cb) {
  debug('_pushAppCodeVersion');
  var contextVersion = this;

  if (appCodeVersion.commit) {
    appCodeVersion.lockCommit = true;
  }
  contextVersion.appCodeVersions.push(appCodeVersion);
  var appCodeVersionModel = contextVersion.appCodeVersions.pop();

  contextVersion.update({
    $push: {
      appCodeVersions: appCodeVersionModel
    }
  }, function (err) {
    if (err) { return cb(err); }
    ContextVersion.findById(contextVersion._id, cb);
  });
};

var ContextVersion = module.exports = mongoose.model('ContextVersions', ContextVersionSchema);
