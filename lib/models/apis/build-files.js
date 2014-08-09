'use strict';

/**
 * Thin s3 wrapper for a single s3 bucket, specifically context build files.
 * Exact same as s3's api with a few additions:
 * a) automatically adds the bucket
 * b) prepends all Keys with "/:contextId/source/"
 * c) atomatically adds "ContentLength"
 * @module models/bucket
 */

var async = require('async');
var path = require('path');
var aws = require('aws-sdk');
var error = require('error');
// var urlJoin = require('url-join');
aws.config.update({
  accessKeyId: process.env.S3_AUTH_ACCESS_KEY,
  secretAccessKey: process.env.S3_AUTH_SECRET_KEY
});
var s3 = new aws.S3();

module.exports = BuildFiles;

function BuildFiles (contextId) {
  this.bucket = process.env.S3_CONTEXT_RESOURCE_BUCKET;
  this.contextId = contextId.toString();
  this.sourcePath = path.join(this.contextId, 'source');
  this.sourceUrl  = 's3://'+path.join(this.bucket, this.sourcePath);
  this.s3 = s3;
}

/* Callbacks types */
/**
 * @callback Bucket-bucketPutCallback
 * @param {err} S3 error
 * @param {object} data the de-serialized data returned from the request
 * @param {date}   data.Expiration If the object expiration is configured, this will contain the
 *   expiration date (expiry-date) and rule ID (rule-id). The value of rule-id is URL encoded.
 * @param {string} data.ETag Entity tag for the uploaded object.
 * @param {string} data.ServerSideEncryption The Server-side encryption algorithm used when storing
 *   this object in S3. Possible values include: "AES256"
 * @param {string} data.VersionId Version of the object. */

/* "PRIVATE" */

/** Create or update a file (private)
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.putFile = function (key, content, cb) {
  var fileKey = path.join(this.sourcePath, key);
  this.s3.putObject({
    Bucket: this.bucket,
    Key: fileKey,
    Body: content,
    ContentLength: content.toString().length
  }, function (err, data) {
    if (err) { return cb(err); }
    data.Key = fileKey;
    cb(null, data);
  });
};

/** Create or update a directory (private)
 *  @param {string} key The s3 key (path) for the directory
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.putDir = function (key, cb) {
  var dirKey = path.join(this.sourcePath, key);
  this.s3.putObject({
    Bucket: this.bucket,
    Key: dirKey
  }, function (err, data) {
    if (err) { return cb(err); }
    data.Key = dirKey;
    data.isDir = true;
    cb(null, data);
  });
};

/** Create or update a directory (private)
 *  @param {string} key The s3 key (path) for the directory
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.removeDir = function (key, cb) {
  var dirKey = path.join(this.sourcePath, key);
  this.s3.deleteObject({
    Bucket: this.bucket,
    Key: dirKey
  }, cb);
};

BuildFiles.prototype.getObject = function (key, version, etag, cb) {
  var data = {
    Bucket: this.bucket,
    Key: path.join(this.sourcePath, key)
  };
  if (version) { data.VersionId = version; }
  if (etag) { data.IfMatch = etag; }
  this.s3.getObject(data, cb);
};

BuildFiles.prototype.removeObject = function (key, cb) {
  var data = {
    Bucket: this.bucket,
    Key: path.join(this.sourcePath, key)
  };
  this.s3.deleteObject(data, cb);
};

BuildFiles.prototype.moveObject = function (sourceKey, version, destKey, cb) {
  var Key = path.join(this.sourcePath, sourceKey);
  var self = this;
  this.copyObject(Key, version, destKey, function (err, newObject) {
    if (err) { return cb(err); }
    self.removeObject(sourceKey, function (err) {
      cb(err, newObject);
    });
  });
};

/**
 * Copies object in S3
 * @param  {string}   sourceKey FULL KEY of source object in S3
 * @param  {string}   version   version string of source object
 * @param  {string}   destKey   SHORT KEY of destination object (no contextId/source)
 * @param  {Function} cb        callback, durp
 * @return {object}             new file object from s3
 */
BuildFiles.prototype.copyObject = function (sourceKey, version, destKey, cb) {
  // S3's copyObject doesn't take a version, for some stupid reason
  var self = this;
  var data = {
    Bucket: this.bucket,
    Key: sourceKey,
    VersionId: version
  };
  this.s3.getObject(data, function (err, data) {
    if (err) { return cb(err); }
    self.putFile(destKey, data.Body.toString(), cb);
  });
};

/* PUBLIC */

/** Create root build directory for the context
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createSourceDir = function (cb) {
  // use put object direct bc it creates the source dir in the root of the bucket
  this.createDir('/', cb);
};

/** Delete root build directory for the context
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.removeSourceDir = function (cb) {
  // use put object direct bc it creates the source dir in the root of the bucket
  this.removeDir('/', cb);
};

BuildFiles.prototype.createDir = function (key, cb) {
  this.putDir(key, error.wrapIfErr(cb, 502, 'Could not create directory "' + key + '"'));
};

BuildFiles.prototype.removeDir = function (key, cb) {
  this.putDir(key, error.wrapIfErr(cb, 502, 'Could not remove directory "' + key + '"'));
};

/**
 * move a directory and all children
 * @param  {string}   sourceDirKey short key that is the source dir
 * @param  {array.fsModel}         sourceFsArr  array of fsObjects
 * @param  {string}   destDirKey   shourt key of the new directory
 * @param  {Function} cb           callback
 * @return {array.fsModel}         new fs models for the db
 */
BuildFiles.prototype.moveDir = function (sourceDirKey, sourceFsArr, destDirKey, cb) {
  var self = this;
  async.map(sourceFsArr, function (fsModel, cb) {
    var destKey, sourceKey;
    if (fsModel.isDir) {
      sourceKey = path.join(fsModel.path, fsModel.name, '/');
      destKey = sourceKey.replace(sourceDirKey, destDirKey);
      sourceKey = path.join(sourceKey, '/');
      destKey = path.join(destKey, '/');
    }
    else {
      sourceKey = path.join(fsModel.path, fsModel.name);
      destKey = sourceKey.replace(sourceDirKey, destDirKey);
      destKey = path.join(destKey);
      sourceKey = path.join(sourceKey);
    }
    self.moveObject(sourceKey, fsModel.VersionId, destKey, function (err, newData) {
      if (err) { return cb(err); }
      fsModel.set(newData);
      cb(null, fsModel);
    });
  }, cb);
};

/** Create a file
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createFile = function (key, content, cb) {
  this.putFile(key, content, error.wrapIfErr(cb, 502, 'Could not create file "'+key+'"'));
};

/** Update a file (or create if non-existant)
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.updateFile = function (key, content, cb) {
  this.putFile(key, content, error.wrapIfErr(cb, 502, 'Could not update file "'+key+'"'));
};

/** Create Dockerfile in the source directory
 *  @param {string} content Content for Dockerfile
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createDockerfile = function (content, cb) {
  this.createFile('Dockerfile', content, cb);
};

BuildFiles.prototype.removeFile = function (key, cb) {
  this.removeObject(key, error.wrapIfErr(cb, 502, 'Could not remove file"' + key + '"'));
};

/**
 * move a file object
 * @param  {string}   key     short key for the file
 * @param  {string}   version versionId
 * @param  {string}   newKey  new short key
 * @param  {Function} cb      callback
 * @return {object}           new file data for the db partay
 */
BuildFiles.prototype.moveFile = function (key, version, newKey, cb) {
  this.moveObject(key, version, newKey, cb);
};

BuildFiles.prototype.getFile = function (key, version, etag, cb) {
  if (typeof version === 'function') {
    cb = version;
    etag = null;
    version = null;
  } else if (typeof etag === 'function') {
    cb = etag;
    etag = null;
  }
  this.getObject(key, version, etag, error.wrapIfErr(cb, 502, 'Could not get file "'+key+'"'));
};

BuildFiles.prototype.copyFileFrom = function (file, cb) {
  var sourceKey = file.Key;
  var version = file.VersionId;
  var destKey = sourceKey.slice(this.sourcePath.length);
  this.copyObject(
    sourceKey,
    version,
    destKey,
    function (err, data) {
      if (!err) {
        data.isDir = file.isDir || false;
      }
      error.wrapIfErr(cb, 502, 'Could not copy file: ' + sourceKey + '->' + destKey)(err, data);
    });
};
