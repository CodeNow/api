'use strict';

var async = require('async');
var Boom = require('dat-middleware').Boom;
var findIndex = require('101/find-index');
var find = require('101/find');
var pluck = require('101/pluck');
var hasProperties = require('101/has-properties');
var pick = require('101/pick');
var debug = require('debug')('runnable-api:infra-code-version:model');

var path = require('path');
var join = path.join;
var mongoose = require('mongoose');
var BuildFilesBucket = require('models/apis/build-files');
var last = require('101/last');

var InfraCodeVersionSchema = require('models/mongo/schemas/infra-code-version');

InfraCodeVersionSchema.methods.bucket = function () {
  return new BuildFilesBucket(this.context);
};

InfraCodeVersionSchema.methods.initWithDefaults = function (cb) {
  var self = this;
  this.bucket().createSourceDir(function (err, files) {
    if (err) { return cb(err); }
    self.files = files;
    cb(null, self);
  });
};

InfraCodeVersionSchema.methods.initWithDockerfile = function (content, cb) {
  var self = this;
  var bucket = this.bucket();
  async.series([
    bucket.createSourceDir.bind(bucket),
    bucket.createDockerfile.bind(bucket, content)
  ], function (err, results) {
    if (err) { return cb(err); }
    self.files = results;
    cb(err, self);
  });
};

var copyFields = ['context', 'files'];
InfraCodeVersionSchema.statics.createCopyById = function (infraCodeVersionId, cb) {
  var InfraCodeVersion = this;
  InfraCodeVersion.findById(infraCodeVersionId, function (err, source) {
    var infraCodeVersion = new InfraCodeVersion(pick(source, copyFields));
    infraCodeVersion.save(cb);
  });
};

/** List files from a version
 *  @params {string} prefix Include to filter in a directory
 *  @returns {Array.object} List of files */
InfraCodeVersionSchema.methods.listFiles = function (searchPath) {
  searchPath = searchPath ? join(searchPath, '/') : '';
  var files = this.files || [];
  // This loop trims out the files to return one directory's worth of information (files and dirs)
  return files.filter(hasProperties({ path: searchPath }));
};

/** Get a single file
 *  @params {string} key Path and filename of a file
 *  @params {function} callback
 *  @returns {object} Info and content of the file */
InfraCodeVersionSchema.methods.getFile = function (key, cb) {
  var fullKey = join(this.context.toString(), 'source', key);
  var files = this.files;
  var file = find(files, hasProperties({ Key: fullKey }));
  if (!file) {
    return cb(Boom.notFound('File not found: ' + key));
  }
  var bucket = this.bucket();
  bucket.getFile(key, file.VersionId, file.ETag, function (err, data) {
    if (err) { return cb(err); }
    file = file.toJSON();
    file.body = data.Body.toString();
    cb(null, file);
  });
};

InfraCodeVersionSchema.methods.getFileByPrefixAndKey = function (Prefix, Key, cb) {
  var path = path.join(Prefix, Key);
  this.getFile(path, cb);
};

/** Creates a file or directory
 *  @params {object} data
 *  @params {string} data.path Path in user build files
 *  @params {string} data.name Filename or directory name ending in a slash
 *  @params {object} data.body File content, empty string for dirs
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
InfraCodeVersionSchema.methods.addFile = function (data, cb) {
  var self = this;
  var bucket = this.bucket();
  var key = join(data.path, data.name);
  var body = data.body;
  if (key.slice(-1) === '/' || data.isDir) {
    key = path.join(key, '/');
    bucket.createDir(key, returnHandler);
  } else if (!self.doesFileKeyExist(key, cb)) {
    bucket.createFile(key, body, returnHandler);
  }

  function returnHandler (err, file) {
    if (err) {
      cb(err);
    }
    else if (!file.Key || !file.VersionId || !file.ETag) {
      cb(Boom.badGateway('file information came back incomplete'));
    }
    else {
      self.files.push(file);
      cb(null, self);
    }
  }
};

/**
 * Checks this Infra-codes current list of files for any that matches the key
 * @param key The S3 key for the file
 * @returns {boolean} Returns true if a file with this key exists
 */
InfraCodeVersionSchema.methods.doesFileKeyExist = function(key, cb) {
  var fullKey = join(this.context.toString(), 'source', key);
  var result = (this.files.filter(hasProperties({ Key: fullKey })).length !== 0);
  if (cb && typeof cb === 'function' ) {
    if (result) {
      cb(Boom.badRequest('File already exists'));
    }
  }
  return result;
};

/** Update a file
 *  @params {string} key Filename and path
 *  @params {string} data File content
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
InfraCodeVersionSchema.methods.updateFile = function (key, data, cb) {
  var self = this;
  var bucket = this.bucket();
  async.waterfall([
    findFile,
    updateFile,
    updateModel
  ], function (err, newFileData) {
    if (err) { return cb(err); }
    cb(err, newFileData);
  });
  function findFile (cb) {
    var fullKey = join(self.context.toString(), 'source', key);
    var file = find(self.files, hasProperties({ Key: fullKey }));
    if (!file) {
      cb(Boom.notFound('could not find file "' + key + '"'));
    } else {
      cb(null, file);
    }
  }
  function updateFile (fileData, cb) {
    bucket.updateFile(key, data, cb);
  }
  function updateModel (fileData, cb) {
    var fullKey = fileData.Key;
    var files = self.files;
    var fileIndex = findIndex(files, hasProperties({ Key: fullKey }));
    self.files.splice(fileIndex, 1, fileData);
    self.save(function (err) {
      cb(err, self.files[fileIndex]);
    });
  }
};

/** Move a file
 *  @params {string} key Filename and path of source
 *  @params {object} data
 *  @params {string} data.path Path in user build files for destination
 *  @params {string} data.name Filename for destination
 *  @params {function} callback
 *  @returns {Array.object} File versions and ETags to return when creating new version (2) */
InfraCodeVersionSchema.methods.moveFile = function (key, data, cb) {
  var self = this;
  var fullKey = join(this.context.toString(), 'source', key);
  var fileIndex = findIndex(this.files, hasProperties({ Key: fullKey }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('(move) invalid resource key: ' + key));
  }
  var file = this.files[fileIndex];
  var bucket = this.bucket();

  async.waterfall([
    bucket.getFile.bind(bucket, key, file.VersionId, file.ETag),
    removeFile,
    createFile,
    updateModel
  ], function (err, newFile) {
    if (err) { return cb(err); }
    cb(err, newFile);
  });

  function removeFile (fileData, cb) {
    bucket.removeFile(key, function (err, deleteMarker) {
      if (err) { return cb(err); }
      deleteMarker.Key = fullKey;
      cb(null, data.Body || fileData.Body, deleteMarker);
    });
  }
  function createFile (fileBody, deleteMarker, cb) {
    if (!data.path) {
      data.path = file.path;
    }
    bucket.createFile(join(data.path, data.name), fileBody, function (err, res) {
      cb(err, deleteMarker, res);
    });
  }
  function updateModel (deleteMarker, newFileData, cb) {
    var deleteIndex = findIndex(self.files, hasProperties({ Key: deleteMarker.Key }));
    self.files.pull({ _id: self.files[deleteIndex]._id });
    self.files.push(newFileData);
    self.save(function (err) {
      cb(err, last(self.files));
    });
  }
};

InfraCodeVersionSchema.methods.copyFilesFromVersion = function (sourceVersionId, cb) {
  debug('copying files from source version', sourceVersionId);
  var self = this;
  // FIXME: WHAT THE ACTUAL FUCK WAS GOING ON With UPDATE
  async.waterfall([
    InfraCodeVersion.findById.bind(InfraCodeVersion, sourceVersionId),
    copyFiles,
    function (newFiles, cb) {
      self.files = newFiles;
      self.save(cb);
      //update({ $set: { files: newFiles }}, cb);
    },
    // InfraCodeVersion.findById.bind(InfraCodeVersion, self._id),
  ], function (err, myself) {
    debug('done copying files and updating');
    cb(err, self);
  });

  function copyFiles (sourceVersion, callback) {
    var bucket = sourceVersion.bucket();
    async.map(
      sourceVersion.files,
      function (file, cb) {
        bucket.copyFileFrom(file.Key, file.VersionId, cb);
      },
      callback);
  }
};

InfraCodeVersionSchema.methods.deleteFile = function (key, cb) {
  var self = this;
  var bucket = this.bucket();
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

var InfraCodeVersion = module.exports = mongoose.model('InfraCodeVersion', InfraCodeVersionSchema);
