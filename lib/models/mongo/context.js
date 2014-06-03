'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var last = require('101/last');
var findIndex = require('101/find-index');
var noop = require('101/noop');
var Boom = require('dat-middleware').Boom;
var extend = require('lodash').extend;

var async = require('async');
var debug = require('debug')('runnableApi:context:model');
var mongoose = require('mongoose');
var url = require('url');
var BuildFilesBucket = require('models/apis/build-files-bucket');
var Boom = require('dat-middleware').Boom;

var Version = require('models/mongo/version');

var BaseSchema = require('models/mongo/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/context */
var ContextSchema = new Schema({
  /** Name must be unique. This is used as the repository name for the Docker image
   *  (e.g. registry:port/namespace/repository -- namespace is the username,
   *  repository is this name)
   *  @type string */
  name: {
    type: String,
    index: { unique: true }
  },
  /** @type string */
  displayName: { type: String },
  /** @type string */
  description: {
    type: String
  },
  /** URL of the Dockerfile
   *  @example 's3://bucket/path/to/a/Dockerfile'
   *  @type string */
  dockerfile: { type: String },
  /** Source references for the context.
   *  By default, each context will have a 'local' source, and an S3 bucket.
   *  This also can be used to reference a remote repository??
   *  @example [{ type: 'local', location: 's3://bucket/path/to/some/source' }]
   *  @type array.object */
  source: {
    type: [{
      sourceType : String,
      location: String
    }]
  },
  /** @type ObjectId */
  owner: {
    type: ObjectId,
    index: true
  },
  /** Defaults to false (private)
   *  @type string */
  'public': {
    type: Boolean,
    'default': false
  },
  /** Versions of the images built of this context (by Docker)
   *  @property {array.ObjectId} versions[] IDs of versions associated with this context
   *  @type array.ObjectId */
  versions: {
    type: [{
      type: ObjectId,
      ref: 'Versions'
    }],
    'default': []
  },
  /** Context from which this was created (copied)
   *  @type ObjectId */
  parentContext: {
    type: ObjectId,
    index: true
  },
  /** Project which owns this Context
   *  @type ObjectId */
  parentProject: {
    type: ObjectId,
    index: true
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  }
});

extend(ContextSchema.methods, BaseSchema.methods);
extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.set('toJSON', { virtuals: true });

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
  * @returns {@link module:models/bucket Bucket}
  */
ContextSchema.methods.buildFilesBucket = function () {
  return new BuildFilesBucket(this._id);
};

/** Check the permissions of the url being used.
  * @param {string} s3Url URL, either a string or URL parsed object
  * @returns {boolean} True if Context has permission to path
  */
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
  var err;
  if (!this.public) {
    err = Boom.forbidden('Context is private');
  }
  cb(err, this);
};

module.exports = mongoose.model('Contexts', ContextSchema);
