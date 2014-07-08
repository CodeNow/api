'use strict';

var async = require('async');
var Boom = require('dat-middleware').Boom;
var findIndex = require('101/find-index');
var find = require('101/find');
var pluck = require('101/pluck');
var hasProps = require('101/has-properties');
var pick = require('101/pick');
var InfraCodeVersion = require('models/mongo/infra-code-version');
var debug = require('debug')('runnable-api:infra-code-version:model');

var path = require('path');
var join = path.join;
var mongoose = require('mongoose');
var BuildFilesBucket = require('models/apis/build-files');
var last = require('101/last');

var InfraCodeVersion = require('models/mongo/schemas/infra-code-version');

InfraCodeVersion.methods.bucket = function () {
  return new BuildFilesBucket(this.context);
};

InfraCodeVersion.methods.initWithDefaults = function (cb) {
  var self = this;
  this.bucket().createSourceDir(function (err) {
    cb(err, self);
  });
};

InfraCodeVersion.methods.initWithDockerfile = function (content, cb) {
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
InfraCodeVersion.statics.createCopyById = function (infraCodeVersionId, cb) {
  var InfraCodeVersion = this;
  InfraCodeVersion.findById(infraCodeVersionId, function (err, source) {
    var infraCodeVersion = new InfraCodeVersion(pick(source, copyFields));
    infraCodeVersion.save(cb);
  });
};

/** List files from a version
 *  @params {string} prefix Include to filter in a directory
 *  @returns {Array.object} List of files */
InfraCodeVersion.methods.listFiles = function (prefix) {
  var files = this.files || [];
  var data = [];
  var dirs = {};
  var startIndex = join(this.context.toString(), 'source').length;
  // This loop trims out the files to return one directory's worth of information (files and dirs)
  files.forEach(function (file) {
    // look for the prefix after the contextid/source bit
    var prefixIndex = file.Key.indexOf(prefix, startIndex);
    if (prefixIndex === -1) { return; }
    var endOfPrefixIndex = prefixIndex + prefix.length;
    var nextDelimiter = file.Key.indexOf('/', endOfPrefixIndex);
    if (nextDelimiter === -1) {
      data.push(file);
    } else if (file.Key.length === nextDelimiter + 1) {
      if (!dirs[file.Key]) {
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
InfraCodeVersion.methods.getFile = function (key, cb) {
  var fullKey = join(this.context.toString(), 'source', key);
  var files = this.files;
  var file = find(files, hasProps({ Key: fullKey }));
  if (!file) {
    return cb(Boom.notFound('File not found: ' + key));
  }
  var bucket = this.bucket();
  bucket.getFile(key, file.VersionId, file.ETag, function (err, data) {
    if (err) { return cb(err); }
    data.Body = data.Body.toString();
    data.Key = fullKey;
    cb(null, data);
  });
};

InfraCodeVersion.methods.getFileByPrefixAndKey = function (Prefix, Key, cb) {
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
InfraCodeVersion.methods.addFile = function (data, cb) {
  var self = this;
  var bucket = this.bucket();
  var key = join(data.path, data.name);
  var body = data.body;
  if (key.slice(-1) === '/') {
    bucket.createDir(key, returnHandler);
  } else {
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

/** Update a file
 *  @params {string} key Filename and path
 *  @params {string} data File content
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
InfraCodeVersion.methods.updateFile = function (key, data, cb) {
  var self = this;
  var bucket = this.bucket();
  async.waterfall([
    findFile,
    updateFile,
    updateModel
  ], function (err, version, newFileData) {
    if (err) { return cb(err); }
    cb(err, newFileData);
  });
  function findFile (cb) {
    self.getFile(key, cb);
  }
  function updateFile (fileData, cb) {
    bucket.updateFile(key, data, cb);
  }
  function updateModel (fileData, cb) {
    var fullKey = join(self.context.toString(), 'source', key);
    var files = self.files;
    var file = find(files, hasProps({ Key: fullKey }));
    file.set(fileData);
    self.save(function (err) {
      cb(err, file);
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
InfraCodeVersion.methods.moveFile = function (key, data, cb) {
  var self = this;
  var fullKey = join(this.context.toString(), 'source', key);
  var fileIndex = findIndex(this.files, hasProps({ Key: fullKey }));
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
    if (!data.Prefix) {
      data.Prefix = path.dirname(key) || '';
    }
    bucket.createFile(join(data.Prefix, data.Key), fileBody, function (err, res) {
      cb(err, deleteMarker, res);
    });
  }
  function updateModel (deleteMarker, newFileData, cb) {
    var deleteIndex = findIndex(self.files, hasProps({ Key: deleteMarker.Key }));
    self.files.pull({ _id: self.files[deleteIndex]._id });
    self.files.push(newFileData);
    self.save(function (err) {
      cb(err, last(self.files));
    });
  }
};

InfraCodeVersion.methods.copyFilesFromVersion = function (sourceVersionId, cb) {
  debug('copying files from source version', sourceVersionId);
  var self = this;
  var bucket = this.bucket();
  async.waterfall([
    InfraCodeVersion.findById.bind(InfraCodeVersion, sourceVersionId),
    copyFiles
  ], function (err) {
    debug('done copying files and saving');
    if (err) { return cb(err); }
    self.save(cb);
  });

  function copyFiles (sourceVersion, callback) {
    async.map(
      sourceVersion.files.map(pluck('Key')),
      bucket.copyObjectFrom.bind(bucket),
      function (err, files) {
        debug('copied the files, saving');
        if (err) { return callback(err); }
        self.files = files;
        self.save(callback);
      });
  }
};

InfraCodeVersion.methods.deleteFile = function (key, cb) {
  var self = this;
  var bucket = this.bucket();
  var fullKey = join(this.context.toString(), 'source', key);
  var fileIndex = findIndex(this.files, hasProps({ Key: fullKey }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('(move) invalid resource key: ' + key));
  }
  bucket.removeFile(key, function (err) {
    if (err) { return cb(err); }
    self.files.pull({ _id: self.files[fileIndex]._id });
    self.save(cb);
  });
};

module.exports = mongoose.model('InfraCodeVersion', InfraCodeVersion);
