'use strict';

/**
 * Versions of a Context!
 * @module models/version
 */

var async = require('async');
var isFunction = require('101/is-function');
var Boom = require('dat-middleware').Boom;
var BuildFilesBucket = require('models/apis/build-files');
var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');

var path = require('path');
var join = path.join;

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
    owner: context.owner
  });
  version.set(props);
  cb(null, version);
};

/** Copy a version to a new version!
 *  @params {object} body
 *  @params {ObjectId} body.versionId Version ID to copy from
 *  @params {ObjectId} ownerId Owner of the newly created version
 *  @params {function} callback
 *  @returns {object} New Version */
VersionSchema.statics.copy = function (body, ownerId, cb) {
  var copyFromId = body.versionId;
  Version.findById(copyFromId, function (err, fromVersion) {
    if (err) { return cb(err); }
    var newVersion = new Version({
      name: fromVersion.name,
      owner: ownerId,
      context: fromVersion.context,
      files: fromVersion.files
    });
    cb(null, newVersion);
  });
};

/** List files from a version
 *  @params {string} prefix Include to filter in a directory
 *  @returns {Array.object} List of files */
VersionSchema.methods.listFiles = function (prefix) {
  var files = this.files || [];
  var data = [];
  var dirs = {};
  var startIndex = this.context.toString().length + 1 + 'source'.length;
  files.forEach(function (file) {
    var prefixIndex = file.Key.indexOf(prefix, startIndex);
    if (prefixIndex === -1) { return; }
    var endOfPrefixIndex = prefixIndex + prefix.length;
    var nextDelimiter = file.Key.indexOf('/', endOfPrefixIndex);
    if (nextDelimiter === -1) {
      data.push(file);
    } else {
      file.Key = file.Key.slice(0, nextDelimiter + 1);
      if (!dirs[file.Key]) {
        file.isDir = true;
        data.push(file);
        dirs[file.Key] = true;
      }
    }
  });
  return data;
};

/** Get a single file
 *  @params {string} key Path and filename of a file
 *  @params {function} callback
 *  @returns {object} Info and content of the file */
VersionSchema.methods.getFile = function (key, cb) {
  var fullKey = join(this.context.toString(), 'source', key);
  var files = this.files;
  var fileIndex = findIndex(files, hasProperties({ Key: fullKey }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('(get) invalid resource key: ' + key));
  }
  var file = files[fileIndex];
  var bucket = this.buildFilesBucket();
  bucket.getFile(key, file.VersionId, file.ETag, function (err, data) {
    if (err) { return cb(err); }
    data.Body = data.Body.toString();
    data.Key = fullKey;
    cb(null, data);
  });
};

/** Create a file version
 *  @params {object} data
 *  @params {string} data.path Path in user build files
 *  @params {string} data.name Filename
 *  @params {object} data.body File content
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
VersionSchema.methods.addFile = function (data, cb) {
  var self = this;
  var bucket = this.buildFilesBucket();
  var key = join(data.path, data.name);
  var body = data.body;
  bucket.createFile(key, body, function (err, file) {
    if (err) { return cb(err); }
    else if (!file.Key || !file.VersionId || !file.ETag) {
      return cb(Boom.badGateway('file information came back incomplete'));
    }
    self.files.push(file);
    cb(null, self);
  });
};

/** Update a file
 *  @params {string} key Filename and path
 *  @params {string} data File content
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
VersionSchema.methods.updateFile = function (key, data, cb) {
  var bucket = this.buildFilesBucket();
  bucket.updateFile(key, data, cb);
};

/** Move a file
 *  @params {string} key Filename and path of source
 *  @params {object} data
 *  @params {string} data.path Path in user build files for destination
 *  @params {string} data.name Filename for destination
 *  @params {function} callback
 *  @returns {Array.object} File versions and ETags to return when creating new version (2) */
VersionSchema.methods.moveFile = function (key, data, cb) {
  var self = this;
  var fullKey = join(this.context.toString(), 'source', key);
  var fileIndex = findIndex(this.files, hasProperties({ Key: fullKey }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('(move) invalid resource key: ' + key));
  }
  var file = this.files[fileIndex];
  var bucket = this.buildFilesBucket();

  async.waterfall([
    bucket.getFile.bind(bucket, key, file.VersionId, file.ETag),
    removeFile,
    createFile,
    updateModel
  ], function (err, version) {
    if (err) { return cb(err); }
    cb(err, version);
  });

  function removeFile (fileData, cb) {
    bucket.removeFile(key, function (err, deleteMarker) {
      if (err) { return cb(err); }
      deleteMarker.Key = fullKey;
      cb(null, fileData.Body, deleteMarker);
    });
  }
  function createFile (fileBody, deleteMarker, cb) {
    if (!data.path) {
      data.path = path.dirname(key) || '';
    }
    bucket.createFile(join(data.path, data.name), fileBody, function (err, res) {
      cb(err, deleteMarker, res);
    });
  }
  function updateModel (deleteMarker, newFileData, cb) {
    var deleteIndex = findIndex(self.files, hasProperties({ Key: deleteMarker.Key }));
    self.files.pull({ _id: self.files[deleteIndex]._id });
    self.files.push(newFileData);
    self.save(cb);
  }
};

VersionSchema.methods.deleteFile = function (key, cb) {
  var self = this;
  var bucket = this.buildFilesBucket();
  var fullKey = join(this.context.toString(), 'source', key);
  var fileIndex = findIndex(this.files, hasProperties({ Key: fullKey }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('(move) invalid resource key: ' + key));
  }
  bucket.removeFile(key, function (err) {
    if (err) { return cb(err); }
    self.files.pull({ _id: self.files[fileIndex]._id });
    self.save(cb);
  });
};

/** Get bucket helper for actions
 *  @returns {object} Bucket helper for this version */
VersionSchema.methods.buildFilesBucket = function () {
  return new BuildFilesBucket(this.context);
};

var Version = module.exports = mongoose.model('Versions', VersionSchema);
