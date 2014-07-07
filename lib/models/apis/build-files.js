'use strict';

/**
 * Thin s3 wrapper for a single s3 bucket, specifically context build files.
 * Exact same as s3's api with a few additions:
 * a) automatically adds the bucket
 * b) prepends all Keys with "/:contextId/source/"
 * c) atomatically adds "ContentLength"
 * @module models/bucket
 */

var path = require('path');
var aws = require('aws-sdk');
var error = require('error');
var configs = require('configs');
// var urlJoin = require('url-join');
aws.config.update({
  accessKeyId: configs.S3.auth.accessKey,
  secretAccessKey: configs.S3.auth.secretKey
});
var s3 = new aws.S3();

module.exports = BuildFiles;

function BuildFiles (contextId) {
  this.bucket = configs.S3.contextResourceBucket;
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
    cb(null, data);
  });
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

/* PUBLIC */

/** Create root build directory for the context
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createSourceDir = function (cb) {
  // use put object direct bc it creates the source dir in the root of the bucket
  this.putDir('/', error.wrapIfErr(cb, 502, 'Could not create directory "source"'));
};

/** Create a file
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createFile = function (key, content, cb) {
  // TODO: handle already exists
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
