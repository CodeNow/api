'use strict'

/**
 * Thin s3 wrapper for a single s3 bucket, specifically context build files.
 * Exact same as s3's api with a few additions:
 * a) automatically adds the bucket
 * b) prepends all Keys with "/:contextId/source/"
 * c) atomatically adds "ContentLength"
 * @module models/bucket
 */

var async = require('async')
var path = require('path')
var aws = require('aws-sdk')
var Boom = require('dat-middleware').Boom
var extend = require('extend')
require('loadenv')()
var s3 = new aws.S3()
var through2 = require('through2')
var crypto = require('crypto')
var Stream = require('stream')

module.exports = BuildFiles

function BuildFiles (contextId) {
  this.bucket = process.env.S3_CONTEXT_RESOURCE_BUCKET
  this.contextId = contextId.toString()
  this.sourcePath = path.join(this.contextId, 'source')
  this.sourceUrl = 's3://' + path.join(this.bucket, this.sourcePath)
  this.s3 = s3
}

BuildFiles.prototype.putFileStream = function (key, stream, cb) {
  var md5 = crypto.createHash('md5')
  var md5Stream = through2({ objectMode: false },
    function transform (chunk, encoding, callback) {
      this.push(chunk)
      md5.update(chunk)
      callback()
    })

  var fileKey = path.join(this.sourcePath, key)
  var params = {
    Bucket: this.bucket,
    Key: fileKey,
    Body: stream.pipe(md5Stream),
    ContentLength: stream.byteCount
  }
  this.s3.upload(params, function (err, data) {
    if (err) { return cb(err) }
    data.Key = fileKey
    data.hash = md5.digest('hex')
    cb(null, data)
  })
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
  var fileKey = path.join(this.sourcePath, key)
  this.s3.putObject({
    Bucket: this.bucket,
    Key: fileKey,
    Body: content,
    ContentLength: content.toString().length
  }, function (err, data) {
    if (err) { return cb(err) }
    data.Key = fileKey
    cb(null, data)
  })
}

/** Create or update a directory (private)
 *  @param {string} key The s3 key (path) for the directory
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.putDir = function (key, cb) {
  var dirKey = path.join(this.sourcePath, key)
  this.s3.putObject({
    Bucket: this.bucket,
    Key: dirKey
  }, function (err, data) {
    if (err) { return cb(err) }
    data.Key = dirKey
    data.isDir = true
    cb(null, data)
  })
}

BuildFiles.prototype.getObject = function (key, version, etag, cb) {
  var self = this
  var objectParams = {
    Bucket: this.bucket,
    Key: path.join(this.sourcePath, key)
  }
  if (version) { objectParams.VersionId = version }
  if (etag) { objectParams.IfMatch = etag }


  this.s3.headObject(objectParams, function (err, data) {
    if (err) {
      return cb(err)
    }
    if (data.ContentLength > process.env.MAX_FILE_DOWNLOAD) {
      return cb(Boom.create(413, 'Requested file is too large.'))
    } else {
      self.s3.getObject(objectParams, cb)
    }
  })
}

BuildFiles.prototype.removeObject = function (key, cb) {
  var data = {
    Bucket: this.bucket,
    Key: path.join(this.sourcePath, key)
  }
  this.s3.deleteObject(data, cb)
}

BuildFiles.prototype.moveObject = function (sourceKey, version, destKey, cb) {
  var Key = path.join(this.sourcePath, sourceKey)
  var self = this
  this.copyObject(Key, version, destKey, function (err, newObject) {
    if (err) { return cb(err) }
    self.removeObject(sourceKey, function (err) {
      cb(err, newObject)
    })
  })
}

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
  var data = {
    Bucket: this.bucket,
    Key: sourceKey,
    VersionId: version
  }
  var stream = this.s3.getObject(data).createReadStream()
  this.putFileStream(destKey, stream, cb)
}

/* PUBLIC */

/** Create root build directory for the context
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createSourceDir = function (cb) {
  // use put object direct bc it creates the source dir in the root of the bucket
  this.createDir('/', cb)
}

BuildFiles.prototype.createDir = function (key, cb) {
  this.putDir(key,
    this.handleError(cb, 'Could not create directory', { key: key }))
}

/**
 * move a directory and all children
 * @param  {string}   sourceDirKey short key that is the source dir
 * @param  {array.fsModel}         sourceFsArr  array of fsObjects
 * @param  {string}   destDirKey   shourt key of the new directory
 * @param  {Function} cb           callback
 * @return {array.fsModel}         new fs models for the db
 */
BuildFiles.prototype.moveDir = function (sourceDirKey, sourceFsArr, destDirKey, cb) {
  var self = this
  async.map(sourceFsArr, function (fsModel, cb) {
    var destKey, sourceKey
    if (fsModel.isDir) {
      sourceKey = path.join(fsModel.path, fsModel.name, '/')
      destKey = sourceKey.replace(sourceDirKey, destDirKey)
      sourceKey = path.join(sourceKey, '/')
      destKey = path.join(destKey, '/')
    } else {
      sourceKey = path.join(fsModel.path, fsModel.name)
      destKey = sourceKey.replace(sourceDirKey, destDirKey)
      // These two lines below are being used to cleanse the keys of any // that may have been
      // added.
      destKey = path.join(destKey)
      sourceKey = path.join(sourceKey)
    }
    self.moveObject(sourceKey, fsModel.VersionId, destKey, function (err, newData) {
      if (err) { return cb(err) }
      fsModel.set(newData)
      cb(null, fsModel)
    })
  }, this.handleError(cb, 'Could not move directory', {
    sourceKey: sourceDirKey,
    destKey: destDirKey
  }))
}

/** Create a file
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.createFile = function (key, content, cb) {
  if (content instanceof Stream /* it's a stream from multiparty */) {
    this.putFileStream(key, content,
      this.handleError(cb, 'Could not create file', { key: key }))
  } else {
    this.putFile(key, content,
      this.handleError(cb, 'Could not update file', { key: key }))
  }
}

/** Update a file (or create if non-existant)
 *  @param {string} key The s3 key (path) for the file
 *  @param {string} content The file content
 *  @param {Bucket-bucketPutCallback} cb Callback */
BuildFiles.prototype.updateFile = function (key, content, cb) {
  this.putFile(key, content,
    this.handleError(cb, 'Could not update file', { key: key }))
}

/**
 * move a file object
 * @param  {string}   key     short key for the file
 * @param  {string}   version versionId
 * @param  {string}   newKey  new short key
 * @param  {Function} cb      callback
 * @return {object}           new file data for the db partay
 */
BuildFiles.prototype.moveFile = function (key, version, newKey, cb) {
  this.moveObject(key, version, newKey, cb)
}

BuildFiles.prototype.getFile = function (key, version, etag, cb) {
  if (typeof version === 'function') {
    cb = version
    etag = null
    version = null
  } else if (typeof etag === 'function') {
    cb = etag
    etag = null
  }
  this.getObject(key, version, etag,
    this.handleError(cb, 'Could not get file', { key: key }))
}

BuildFiles.prototype.copyFileFrom = function (file, cb) {
  var sourceKey = file.Key
  var version = file.VersionId
  var destKey = sourceKey.slice(this.sourcePath.length)
  var self = this
  this.copyObject(
    sourceKey,
    version,
    destKey,
    function (err, data) {
      if (!err) {
        data.isDir = file.isDir || false
      }
      self.handleError(cb, 'Could not copy file', {
        sourceKey: sourceKey,
        destKey: destKey
      })(err, data)
    })
}

/**
 * returns a callback which will cast s3 errors to boom errors (if an error occurs)
 * @param  {Function} cb         callback to pass arguments through to
 * @param  {String}   errMessage boom error message
 * @param  {Object}   errDebug   docker error debug info
 */
BuildFiles.prototype.handleError = function (cb, errMessage, errDebug) {
  var self = this
  return function (err) {
    if (err) {
      var code
      if (!err.statusCode) {
        code = 504
      } else if (err.statusCode === 500) {
        code = 502
      } else { // code >= 400 && code !== 500
        code = err.statusCode
      }

      var message = err.message
        ? errMessage + ': ' + err.message
        : errMessage
      var errS3 = extend({
        bucket: self.bucket,
        contextId: self.contextId,
        sourcePath: self.sourcePath,
        sourceUrl: self.sourceUrl
      }, errDebug || {})
      if (code >= 400) {
        cb(Boom.create(code, message, { s3: errS3, err: err }))
      } else {
        // FIXME: hack for now - we need a way of transporting 300 errors to the user
        // other than boom..
        var boomErr = Boom.create(400, message, { s3: errS3, err: err })
        boomErr.output.statusCode = code
        cb(boomErr)
      }
      return
    }
    cb.apply(null, arguments)
  }
}
