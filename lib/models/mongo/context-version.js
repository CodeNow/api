'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var isFunction = require('101/is-function');
var Boom = require('dat-middleware').Boom;
var pick = require('101/pick');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var mongoose = require('mongoose');

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
var copyFields = [
  'appCodeVersion',
  'owner',
  'context',
  'dockerHost'
];
//FIXME: Future, don't copy the dockerHost
ContextVersionSchema.statics.createDeepCopy = function (version, userId, cb) {
  var ContextVersion = this;
  var newVersion = new ContextVersion(pick(version, copyFields));
  // FIXME: this breaks github mock hook for now..
  newVersion.createdBy = userId;
  if (!version.infraCodeVersion) {
    cb(Boom.badImplementation('version is missing infraCodeVersion'));
  }
  else {
    InfraCodeVersion.createCopyById(version.infraCodeVersion, function (err, newInfraCodeVersion) {
      if (err) { return cb(err); }

      newVersion.infraCodeVersion = newInfraCodeVersion._id;
      newVersion.save(function (err, version) {
        if (err) {
          newInfraCodeVersion.remove(); // ignore remove error
        }
        cb(err, version);
      });
    });
  }
};
var shallowCopyFields = [
  'appCodeVersion',
  'context',
  'environment',
  'infracodeVersion',
  'dockerHost'
];
ContextVersionSchema.statics.createShallowCopy = function (version, userId, cb) {
  var ContextVersion = this;
  var newVersion = new ContextVersion(pick(version, shallowCopyFields));
  newVersion.createdBy = userId;
  if (!version.infraCodeVersion) {
    cb(Boom.badImplementation('version is missing infraCodeVersion'));
  }
  cb(version);
};

module.exports = mongoose.model('ContextVersions', ContextVersionSchema);
