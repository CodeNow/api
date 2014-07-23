'use strict';

var async = require('async');
var Boom = require('dat-middleware').Boom;
var findIndex = require('101/find-index');
var find = require('101/find');
var hasProperties = require('101/has-properties');
var pick = require('101/pick');
var debug = require('debug')('runnable-api:infra-code-version:model');

var path = require('path');
var join = path.join;
var mongoose = require('mongoose');
var BuildFilesBucket = require('models/apis/build-files');

var InfraCodeVersionSchema = require('models/mongo/schemas/infra-code-version');

InfraCodeVersionSchema.methods.bucket = function () {
  return new BuildFilesBucket(this.context);
};

InfraCodeVersionSchema.methods.initWithDefaults = function (cb) {
  var self = this;
  this.bucket().createSourceDir(function (err, file) {
    if (err) { return cb(err); }
    self.files = [file];
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
      cb(Boom.conflict('File already exists'));
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
  ], cb);
  function findFile (cb) {
    var fullKey = join(self.context.toString(), 'source', key);
    var file = find(self.files, hasProperties({ Key: fullKey }));
    if (!file) {
      cb(Boom.notFound('could not find file "' + key + '"'));
    } else {
      cb(null, file);
    }
  }
  function updateFile (file, cb) {
    bucket.updateFile(key, data, function (err, fileData) {
      cb(err, file, fileData);
    });
  }
  function updateModel (file, fileData, cb) {
    file.set(fileData);
    InfraCodeVersion.update({
      _id: self._id,
      'files._id': file._id
    }, {
      $set: {
        'files.$': file.toJSON()
      }
    }, function (err) {
      if (err) { return cb(err); }
      file.set('body', data, { strict: false });
      cb(null, file);
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
    return cb(Boom.badRequest('File not found: ' + key));
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
  function updateModel (deleteMarker, fileData, cb) {
    var file = find(self.files, hasProperties({ Key: deleteMarker.Key }));
    file.set(fileData);
    InfraCodeVersion.update({
      _id: self._id,
      'files._id': file._id
    }, {
      $set: {
        'files.$': file.toJSON()
      }
    }, function (err) {
      cb(err, file);
    });
  }
};

InfraCodeVersionSchema.methods.copyFilesFrom = function (sourceInfraCodeVersionId, cb) {
  var self = this;
  async.waterfall([
    function (cb) {
      InfraCodeVersion.findById(sourceInfraCodeVersionId, function (err, infraCodeVersion) {
        if (err) {
          cb(err);
        }
        else if (!infraCodeVersion) {
          cb(Boom.notFound('Source InfraCodeVersion not found'));
        }
        else {
          cb(null, infraCodeVersion);
        }
      });
    },
    copyFiles,
    function (newFiles, cb) {
      // TODO: something was going bonkers here trying to just update it, but this seems to work
      self.files = newFiles;
      self.save(cb);
    },
  ], function (err, myself) {
    debug('done copying files and updating');
    cb(err, myself);
  });

  function copyFiles (sourceVersion, callback) {
    var bucket = self.bucket();
    async.map(
      sourceVersion.files,
      function (file, cb) {
        // this protects the scope of bucket
        bucket.copyFileFrom(file, cb);
      },
      callback);
  }
};

InfraCodeVersionSchema.methods.deleteFile = function (key, cb) {
  var infraCodeVersion = this;
  var bucket = this.bucket();
  var fullKey = join(this.context.toString(), 'source', key);
  var file = find(this.files, hasProperties({ Key: fullKey }));
  if (!file) {
    return cb(Boom.badRequest('File not found:' + key));
  }
  bucket.removeFile(key, function (err) {
    if (err) { return cb(err); }
    infraCodeVersion.update({
      $pull: {
        files: {
          _id: file._id
        }
      }
    }, cb);
  });
};

InfraCodeVersionSchema.methods.deleteSourceDir = function (cb) {
  var infraCodeVersion = this;
  this.deleteFile('/', function (err) {
    cb(err, infraCodeVersion);
  });
};

var InfraCodeVersion = module.exports = mongoose.model('InfraCodeVersion', InfraCodeVersionSchema);
