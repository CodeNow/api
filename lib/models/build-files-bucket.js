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
aws.config.update({
  accessKeyId: configs.S3.auth.accessKey,
  secretAccessKey: configs.S3.auth.secretKey
});
var s3 = new aws.S3();

module.exports = Bucket;

function Bucket (contextId) {
  this.contextId = contextId.toString();
  this.bucket = configs.S3.contextResourceBucket;
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
Bucket.prototype.putFile = function (key, content, cb) {
  s3.putObject({
    Bucket: this.bucket,
    Key: path.join(this.contextId, 'source', key),
    Body: content,
    ContentLength: content.toString().length
  }, cb);
};

/** Create or update a directory (private)
 *  @param {string} key The s3 key (path) for the directory
 *  @param {Bucket-bucketPutCallback} cb Callback */
Bucket.prototype.putDir = function (key, cb) {
  s3.putObject({
    Bucket: this.bucket,
    Key: path.join(this.contextId, 'source', key)
  }, cb);
};

/* PUBLIC */

/** Create root build directory for the context
 *  @param {Bucket-bucketPutCallback} cb Callback */
Bucket.prototype.createSourceDir = function (cb) {
  // use put object direct bc it creates the source dir in the root of the bucket
  this.s3.putObject({
    Bucket: this.bucket,
    Key:  path.join(this.contextId, 'source')
  }, error.wrapIfErr(cb, 502, 'Could not create directory "source"'));
};

/** Create a file
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
Bucket.prototype.createFile = function (key, content, cb) {
  // TODO: handle already exists
  this.putFile(key, content, error.wrapIfErr(cb, 502, 'Could not create file "'+key+'"'));
};

/** Update a file (or create if non-existant)
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
Bucket.prototype.updateFile = function (key, content, cb) {
  this.putFile(key, content, error.wrapIfErr(cb, 502, 'Could not update file "'+key+'"'));
};

/** Create Dockerfile in the source directory
 *  @param {string} content Content for Dockerfile
 *  @param {Bucket-bucketPutCallback} cb Callback */
Bucket.prototype.createDockerfile = function (content, cb) {
  this.createFile('Dockerfile', content, cb);
};

