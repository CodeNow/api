'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var _ = require('lodash');
var async = require('async');
var error = require('error');
var join = require('path').join;
var mongoose = require('mongoose');
var unescape = require('querystring').unescape;
var url = require('url');

var aws = require('aws-sdk');
var configs = require('configs');
aws.config.update({
  accessKeyId: configs.S3.auth.accessKey,
  secretAccessKey: configs.S3.auth.secretKey
});
var s3 = new aws.S3();

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
    type: String,
    'default': ''
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
  source: [{
    type: String,
    location: String
  }],
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
      name: { type: String, 'default': ''},
      created: {
        type: Date,
        'default': Date.now,
        index: true
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

_.extend(ContextSchema.methods, BaseSchema.methods);
_.extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.set('toJSON', { virtuals: true });

/** Check the permissions of the url being used. 
  * @param {string} s3Url URL, either a string or URL parsed object
  * @returns {boolean} True/False if object id matches in the path
  */
ContextSchema.methods.checkPathPermission = function (s3Url) {
  if (typeof s3Url === 'string') {
    s3Url = url.parse(s3Url);
  }
  // let's check to make sure the context is uploading to it's own bucket
  return s3Url.pathname.slice(1).split('/')[0] !== this._id.toString();
};

/** Get a URL for a context's resource file 
  * @param {string} file File name (and path) of a resource, relative to the user's root
  * @returns {string} URL of the resource in the context's storage
  */
ContextSchema.methods.getResourceUrl = function (file) {
  var s3Key = join(this._id.toString(), 'source', file);
  return url.format({
    protocol: 's3:',
    slashes: true,
    host: configs.S3.contextResourceBucket,
    pathname: s3Key
  });
};

/** Upload a single resource to S3
  * @param {string} file File name (and path) of a resource, relative to the user's root
  * @param {string} content Content of the file (or null if a directory)
  * @param {function} callback Receives (err, data)
  */
ContextSchema.methods.uploadResource = function (s3Url, content, callback) {
  s3Url = url.parse(s3Url);
  // let's check to make sure the context is uploading to it's own bucket
  if (this.checkPathPermission(s3Url)) {
    return callback(error(403, 'tried to upload the resource to an invalid location'));
  }
  var contentLength = content ? content.length : 0;
  var data = {
    Bucket: s3Url.hostname,
    Key: s3Url.pathname.slice(1), // remove '/' from the front
    Body: content,
    ContentLength: contentLength
  };
  s3.putObject(data, callback);
};

/** Get a single resource to S3
  * @param {string} s3Url URL of the resource to get
  * @param {function} callback Receives (err, data)
  */
ContextSchema.methods.getResource = function (s3Url, callback) {
  s3Url = url.parse(s3Url);
  if (this.checkPathPermission(s3Url)) {
    return callback(error(403, 'tried to get a resource to an invalid location'));
  }
  var data = {
    Bucket: s3Url.hostname,
    Key: s3Url.pathname.slice(1),
    ResponseContentType: 'application/json'
  };
  s3.getObject(data, callback);
};

/** List resources stored in S3 for the context. Accounts for 1000 file limit and returns them all
  * @param {string} prefix Prefix of the file path, relative to user's directory. Defaults to '/'
  * @param {function} callback Receives (err, data)
  */
ContextSchema.methods.listResources = function (prefix, callback) {
  if (typeof prefix === 'function') {
    callback = prefix;
    prefix = '/';
  }
  var s3Url = url.parse(this.getResourceUrl(prefix));
  var IsTruncated = true;
  var NextMarker = false;
  var allData = [];
  var lastData = [];

  async.whilst(
    isTruncated,
    downloadObjectList,
    combineAllData
  );

  function isTruncated () { return IsTruncated; }
  function downloadObjectList (callback) {
    var data = {
      Bucket: unescape(s3Url.hostname),
      Prefix: unescape(s3Url.path.slice(1))
    };
    if (NextMarker) {
      data.Marker = NextMarker;
    }
    s3.listObjects(data, function (err, results) {
      if (err) {
        return callback(err);
      }
      IsTruncated = results.IsTruncated;
      NextMarker = IsTruncated ? _.last(results.Contents).Key : false;
      allData.push.apply(allData, results.Contents);
      delete results.Contents;
      lastData = results;
      callback();
    });
  }
  function combineAllData (err) {
    if (err) {
      return callback(err);
    }
    lastData.Contents = allData;
    callback(null, lastData);
  }
};

/** Create the source directory in S3 for the context and saves the URL in the context
  * @param {function} callback Receives (err, {@link module:models/context Context})
  */
ContextSchema.methods.createSourceDirectory = function (callback) {
  var self = this;
  if (!this.source.length) {
    // we haven't created a source directory yet!
    var source = {
      type: 'local',
      location: self.getResourceUrl('/')
    };
    this.source.push(source);

    this.uploadResource(source.location, null, function (err) {
      callback(err, self);
    });
  } else {
    // then we have a bucket! (only condition at the moment)
    if (this.source[0] && this.source[0].type === 'local') {
      callback(null, self);
    }
  }
};

/** Upload the Dockerfile to S3 and save the URL in the context
  * @param {function} callback Receives (err, {@link module:models/context Context})
  */
ContextSchema.methods.uploadDockerfile = function (data, callback) {
  var s3DockerfileUrl = this.dockerfile;
  if (!s3DockerfileUrl) {
    var s3Key = join(this._id.toString(), 'dockerfile', 'Dockerfile');
    var dockerfileUrl = url.format({
      protocol: 's3:',
      slashes: true,
      host: configs.S3.contextResourceBucket,
      pathname: s3Key
    });
    this.dockerfile = dockerfileUrl;
  }

  var self = this;
  this.uploadResource(this.dockerfile, data, function (err) {
    callback(err, self);
  });
};

module.exports = mongoose.model('Contexts', ContextSchema);
