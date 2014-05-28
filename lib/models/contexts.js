'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var last = require('101/last');
var findIndex = require('101/find-index');
var noop = require('101/noop');
var pick = require('101/pick');
var hasProperties = require('101/has-properties');
var Boom = require('dat-middleware').Boom;
var extend = require('lodash').extend;

var async = require('async');
var debug = require('debug')('runnableApi:context:model');
var error = require('error');
var join = require('path').join;
var mongoose = require('mongoose');
var unescape = require('querystring').unescape;
var url = require('url');
var BuildFilesBucket = require('./build-files-bucket');

var BaseSchema = require('models/BaseSchema');
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
  /** Versions of the images built of this context (by Docker)
   *  @property {array.object} versions[]
   *  @property {ObjectId} versions[]._id Tag of the Docker image (name:tag), CREATED BY MONGO
   *  @property {date} versions[].created Date the tag was created (and image built)
   *  @property {string} versions[].name Friendly display name for the tag
   *  @example [{
   *    _id: 'someObjectId', // this will be used as the docker tag
   *    created: 'some-date-time',
   *    name: 'Some Nice Name'
   *  }]
   *  @type array.object */
  versions: {
    type: [{
      // the ID of this object will be the docker tag
      name: { type: String },
      created: {
        type: Date,
        'default': Date.now,
        index: true
      },
      dockerfile: {
        type: [{
          Key: String,
          ETag: String,
          VersionId: String
        }]
      },
      files: {
        type: [{
          Key: String,
          ETag: String,
          VersionId: String
        }],
        'default': []
      }
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
ContextSchema.statics.createAndSaveFromDockerfile = function (owner, dockerfile, cb) {
  var Context = this;
  var context = new Context();
  context.set({ owner: owner });
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

    var version = {};
    version.dockerfile = versions.dockerfile;
    version.files = [versions.sourceDir];
    context.versions.push(version);
    cb(null, context);
  });
  return context;
};

ContextSchema.methods.listVersions = function () {
  var strippedVersions = this.versions.map(pick(['_id', 'created', 'name']));
  return strippedVersions;
};

ContextSchema.methods.listFiles = function (versionId, prefix) {
  var version = this.findVersion(versionId);
  var files = version.files;
  var data = [];
  var prefixes = {};
  var startIndex = this._id.toString().length + 1 + 'source'.length;
  files.forEach(function (file) {
    var prefixIndex = file.Key.indexOf(prefix, startIndex);
    if (prefixIndex === -1) { return; }
    var endOfPrefixIndex = prefixIndex + prefix.length;
    var nextDelimiter = file.Key.indexOf('/', endOfPrefixIndex);
    if (nextDelimiter === -1) {
      data.push(file);
    } else {
      prefixes[file.Key.slice(0, nextDelimiter + 1)] = true;
    }
  });
  Object.keys(prefixes).forEach(function (prefix) {
    data.push({ Prefix: prefix });
  });
  return data;
};

ContextSchema.methods.getFile = function (versionId, key, cb) {
  var version = this.findVersion(versionId);
  if (version.isBoom) {
    return cb(version);
  }
  var files = version.files;
  var fileIndex = findIndex(files, hasProperties({ Key: key }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('invalid resource key: ' + key));
  }
  var file = files[fileIndex];
  var bucket = this.buildFilesBucket();
  bucket.getFile(file.Key, file.VersionId, file.ETag, cb);
};

ContextSchema.methods.findVersion = function (versionId, cb) {
  var data;
  var err = null;
  if (versionId === 'latest') {
    data = last(this.versions);
  } else {
    var i = findIndex(this.versions,
      function (v) { return v._id.toString() === versionId.toString(); });
    if (i === -1) {
      err = Boom.badRequest('invalid version id');
    } else {
      data = this.versions[i];
    }
  }
  if (cb && typeof cb === 'function') {
    cb(err, this);
  } else {
    return err ? err : data;
  }
};

ContextSchema.methods.addFile = function (key, body, cb) {
  var bucket = this.buildFilesBucket();
  bucket.createFile(key, body, cb);
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

module.exports = mongoose.model('Contexts', ContextSchema);
