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

module.exports = Bucket;

function Bucket (contextId) {
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
Bucket.prototype.putFile = function (key, content, cb) {
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
Bucket.prototype.putDir = function (key, cb) {
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

Bucket.prototype.getObject = function (key, version, etag, cb) {
  var data = {
    Bucket: this.bucket,
    Key: path.join(this.sourcePath, key)
  };
  if (version) { data.VersionId = version; }
  if (etag) { data.IfMatch = etag; }
  this.s3.getObject(data, cb);
};

/* PUBLIC */

/** Create root build directory for the context
 *  @param {Bucket-bucketPutCallback} cb Callback */
Bucket.prototype.createSourceDir = function (cb) {
  // use put object direct bc it creates the source dir in the root of the bucket
  this.putDir('/', error.wrapIfErr(cb, 502, 'Could not create directory "source"'));
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

Bucket.prototype.getFile = function (key, version, etag, cb) {
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


// /** List resources stored in S3 for the context. Accounts for 1000 file limit and returns them all
//   * @param {string} prefix Prefix of the file path, relative to user's directory. Defaults to '/'
//   * @param {function} callback Receives (err, data)
//   */
// ContextSchema.methods.listResources = function (prefix, callback) {
//   debug('listing resources...');
//   if (typeof prefix === 'function') {
//     callback = prefix;
//     prefix = '/';
//   }
//   var s3Url = url.parse(this.getResourceUrl(prefix));
//   var IsTruncated = true;
//   var NextMarker = false;
//   var allData = [];
//   var lastData = [];

//   async.whilst(
//     isTruncated,
//     downloadObjectList,
//     combineAllData
//   );

//   function isTruncated () { return IsTruncated; }
//   function downloadObjectList (callback) {
//     var data = {
//       Bucket: unescape(s3Url.hostname),
//       Prefix: unescape(s3Url.path.slice(1))
//     };
//     if (NextMarker) {
//       data.Marker = NextMarker;
//     }
//     s3.listObjects(data, function (err, results) {
//       if (err) {
//         return callback(err);
//       }
//       IsTruncated = results.IsTruncated;
//       NextMarker = IsTruncated ? last(results.Contents).Key : false;
//       allData.push.apply(allData, results.Contents);
//       delete results.Contents;
//       lastData = results;
//       callback();
//     });
//   }
//   function combineAllData (err) {
//     if (err) {
//       return callback(err);
//     }
//     debug('listed resources');
//     lastData.Contents = allData;
//     callback(null, lastData);
//   }
// };


// ContextSchema.methods.copyResource = function (s3Source, s3Dest, callback) {
//   s3Source = url.parse(s3Source);
//   s3Dest = url.parse(s3Dest);
//   s3.copyObject({
//     Bucket: s3Dest.hostname,
//     Key: s3Dest.pathname.slice(1),
//     CopySource: join(s3Source.hostname, s3Source.pathname.slice(1))
//   }, callback);
// };

// * Return a full copy of the Context, and copy the data in S3
//  *  @param {function} callback function (err, @{link module:models/context Context}})
// ContextSchema.methods.copy = function (callback) {
//   debug('starting copy');
//   var newContext = new Context();
//   var copyAttributes = [
//     'name',
//     'displayName',
//     'description'
//   ];
//   newContext.set(pick(this, copyAttributes));
//   // FIXME: this is dumb --tj
//   newContext.name += Math.random().toString(36).substring(2, 5);
//   newContext.dockerfile = newContext.getDockerfileUrl();

//   // copy the dockerfile (if has one) and the source directory (if has one)
//   var tasks = {};
//   if (this.dockerfile) {
//     debug('adding dockerfile to copy');
//     tasks.dockerfile = this.copyResource.bind(this, this.getDockerfileUrl(), newContext.dockerfile);
//   }

//   if (this.source.length && this.source[0].sourceType === 'local') {
//     debug('have source to copy...');
//     newContext.source.push({
//       sourceType: 'local',
//       location: newContext.getResourceUrl('/')
//     });
//     var self = this;
//     async.waterfall([
//       this.listResources.bind(this),
//       copyEachResource
//     ], finishCopy);
//   } else {
//     debug('do not have source to copy (' + this.source.length + ')');
//     finishCopy();
//   }

//   function copyEachResource (resources, callback) {
//     resources.Contents.forEach(function (file) {
//       debug('adding file to copy: ' + file.Key);
//       var resource = file.Key.split('/').slice(2).join('/');
//       if (last(file.Key) === '/') {
//         resource += '/';
//       }
//       tasks[resource] = self.copyResource.bind(self,
//         self.getResourceUrl(resource),
//         newContext.getResourceUrl(resource));
//       callback();
//     });
//   }
//   function finishCopy (err) {
//     if (err) {
//       return callback(err);
//     }
//     tasks.saveContext = newContext.save.bind(newContext);
//     async.parallel(tasks, function (err, results) {
//       if (err) {
//         return callback(err);
//       }
//       debug('done copying');
//       callback(err, results.saveContext.shift());
//     });
//   }
// };
