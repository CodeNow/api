'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;

var async = require('async');
var debug = require('debug')('runnableApi:context:model');
var mongoose = require('mongoose');
var url = require('url');
var BuildFilesBucket = require('models/apis/build-files-bucket');
var Boom = require('dat-middleware').Boom;

var Version = require('models/mongo/version');


var ContextSchema = require('models/mongo/schemas/context');

/** Create a context with a version from a dockerfile.
 *  @param {string|ObjectId} owner User Id of the owner
 *  @param {string} dockerfile Dockerfile content for the context
 *  @param {function} cb function (err, {@link module:models/context Context}) */
ContextSchema.statics.createAndSaveFromDockerfile = function (dockerfile, props, cb) {
  var Context = this;
  var context = new Context();
  context.set(props || {});
  context.addVersionFromDockerfile(dockerfile, function (err, context) {
    if (err) { return cb(err); }

    context.save(cb);
  });
};

/** Create and add version from a dockerfile.
 *  @param {string} content Dockerfile content for the context
 *  @param {function} cb function (err, {@link module:models/context Context}) */
ContextSchema.methods.addVersionFromDockerfile = function (content, cb) {
  cb = cb || noop;
  var context = this;
  var bucket = this.buildFilesBucket();
  async.series({
    sourceDir: bucket.createSourceDir.bind(bucket),
    dockerfile: bucket.createDockerfile.bind(bucket, content),
  },
  function (err, versions) {
    if (err) { return cb(err); }

    var version = new Version({
      dockerfile: versions.dockerfile,
      files: [versions.sourceDir],
      context: context._id,
      owner: context.owner
    });
    context.versions.push(version._id);
    version.save(function (err) {
      cb(err, context);
    });
  });
};

/** Get an instance of a s3 bucket for to the container's build files.
  * @returns {@link module:models/bucket Bucket} */
ContextSchema.methods.buildFilesBucket = function () {
  return new BuildFilesBucket(this._id);
};

/** Check the permissions of the url being used.
  * @param {string} s3Url URL, either a string or URL parsed object
  * @returns {boolean} True if Context has permission to path */
ContextSchema.methods.checkPathPermission = function (s3Url) {
  if (typeof s3Url === 'string') {
    s3Url = url.parse(s3Url);
  }
  // let's check to make sure the context is uploading to it's own bucket
  return s3Url.pathname.slice(1).split('/')[0] === this._id.toString();
};

/** Check to see if a project is public.
 *  @param {function} [cb] function (err, {@link module:models/project Project}) */
ContextSchema.methods.isPublic = function (cb) {
  debug('checking to see if context is public: ' + this.public);
  var err;
  if (!this.public) {
    err = Boom.forbidden('Context is private');
  }
  cb(err, this);
};

module.exports = mongoose.model('Contexts', ContextSchema);
