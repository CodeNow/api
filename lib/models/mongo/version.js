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

var VersionSchema = require('models/mongo/schemas/version');

/** Create a version for a context */
VersionSchema.statics.createForContext = function (context, props, cb) {
  var Version = this;
  if (isFunction(props)) {
    cb = props;
    props = null;
  }
  props = props || {};
  var version = new Version({
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
VersionSchema.statics.createCopy = function (version, userId, cb) {
  var newVersion = new Version(pick(version, copyFields));
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

var Version = module.exports = mongoose.model('Versions', VersionSchema);
