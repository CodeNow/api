'use strict';

var async = require('async');
var Boom = require('dat-middleware').Boom;
var passAny = require('101/pass-any');
var find = require('101/find');
var hasProperties = require('101/has-properties');
var pick = require('101/pick');
var last = require('101/last');
var isFunction = require('101/is-function');
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
/**
 * find infraCodeVersoin with a single fs (file or dir)
 * @param  {ObjectId}   id   infraCodeVersion id
 * @param  {string}   path   path of the fs to find
 * @param  {Function} cb     callback
 */
InfraCodeVersionSchema.methods.findFs = function (path, cb) {
  var Key = join(this.context.toString(), 'source', path);
  var regexp = new RegExp('^'+Key+'(\/)?$');
  InfraCodeVersion.findOne({
    _id: this._id
  }, {
    files: {
      $elemMatch: {
        Key: regexp
      }
    }
  }, function (err, infraCodeVersion) {
    cb(err, infraCodeVersion && infraCodeVersion.files[0]);
  });
};
/**
 * find infraCodeVersoin with a single dir
 * @param  {ObjectId}   id      infraCodeVersion id
 * @param  {string}   dirPath path of the dir to find
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.findDir = function (dirPath, cb) {
  var Key = join(this.context.toString(), 'source', dirPath, '/');
  var regexp = new RegExp('^'+Key+'$');
  InfraCodeVersion.findOne({
    _id: this._id
  }, {
    files: {
      $elemMatch: {
        Key: regexp
      }
    }
  }, function (err, infraCodeVersion) {
    cb(err, infraCodeVersion && infraCodeVersion.files[0]);
  });
};
/**
 * find infraCodeVersoin with a single file
 * @param  {ObjectId}   id      infraCodeVersion id
 * @param  {string}   filepath path of the file to find
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.findFile = function (filepath, skipBody, cb) {
  if (last(filepath) === '/') {
    filepath = filepath.slice(0, -1);
  }
  if (isFunction(skipBody)) {
    cb = skipBody;
    skipBody = false;
  }
  var bucket = this.bucket();
  var Key = join(this.context.toString(), 'source', filepath);
  var regexp = new RegExp('^'+Key+'$');
  var file;
  InfraCodeVersion.findOne({
    _id: this._id
  }, {
    files: {
      $elemMatch: {
        Key: regexp
      }
    }
  }, function (err, infraCodeVersion) {
    if (err) {
      cb(err);
    }
    else if (!infraCodeVersion || !infraCodeVersion.files[0]) {
      cb(null, null);
    }
    else if (skipBody) {
      file = infraCodeVersion.files[0];
      cb(null, file);
    }
    else{
      file = infraCodeVersion.files[0];
      bucket.getFile(filepath, file.VersionId, file.ETag, function (err, data) {
        if (err) { return cb(err); }
        file.set('body', data.Body.toString(), { strict: false });
        cb(null, file);
      });
    }
  });
};
/**
 * find infraCodeVersion with files in a dir
 * @param  {ObjectId}   id      infraCodeVersion id
 * @param  {string}   dirPath full path of the directory
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.findDirContents = function (dirPath, cb) {
  var dirKey = join(this.context.toString(), 'source', dirPath, '/');
  var regexp = new RegExp('^'+dirKey+'.+');
  var self = this;
  this.findDir(dirPath, function (err, dir) {
    if (err) {
      cb(err);
    }
    else if (!dir) {
      cb(Boom.notFound('Dir not found: '+dirPath));
    }
    else {
      InfraCodeVersion.findById(self._id, function (err, infraCodeVersion) {
        if (err) { return cb(err); }
        infraCodeVersion.files = infraCodeVersion.files.filter(function (file) {
          return regexp.test(file.Key);
        });
        cb(null, infraCodeVersion.files);
      });
    }
  });
};
/**
 * create a file or dir
 * @param  {object}   data fs data
 * @param  {Function} cb   callback
 */
InfraCodeVersionSchema.methods.createFs = function (data, cb) {
  var infraCodeVersion = this;
  var bucket = this.bucket();
  async.waterfall([
    checkParentDirExists,
    checkForConflict,
    createInBucket,
    updateMongo
  ], cb);
  var fullpath = join(data.path, data.name);
  function checkParentDirExists (cb) {
    infraCodeVersion.findFs(data.path, function (err, fs) {
      if (err) {
        cb(err);
      }
      else if (!fs) {
        cb(Boom.notFound('Dir not found: '+data.path));
      }
      else if (!fs.isDir) {
        cb(Boom.badRequest('Cannot create a file in a file'));
      }
      else {
        cb();
      }
    });
  }
  function checkForConflict (cb) {
    infraCodeVersion.findFs(fullpath, function (err, fs) {
      if (err) {
        cb(err);
      }
      else if (fs) {
        var type = fs.isDir ? 'Dir' : 'File';
        cb(Boom.conflict(type+' already exists: '+fullpath));
      }
      else {
        cb();
      }
    });
  }
  function createInBucket (cb) {
    if (last(fullpath) === '/' || data.isDir) {
      fullpath = join(fullpath, '/');
      bucket.createDir(fullpath, cb);
    } else {
      bucket.createFile(fullpath, data.body, cb);
    }
  }
  function updateMongo (s3Data, cb) {
    infraCodeVersion.files = infraCodeVersion.files || [];
    infraCodeVersion.files.push(s3Data);
    var fileData = infraCodeVersion.files.pop().toJSON();
    var fileKey, dirKey;
    if (last(fileData.Key) === '/') {
      fileKey = fileData.Key.slice(0, -1);
      dirKey = fileData.Key;
    }
    else {
      fileKey = fileData.Key;
      dirKey = join(fileData.Key, '/');
    }
    // atomic update
    InfraCodeVersion.update({
      _id: infraCodeVersion._id,
      'files.Key': { $nin: [ fileKey, dirKey ] }
    }, {
      $push: {
        files: fileData
      }
    }, function (err, numUpdated) {
      if (err) {
        cb(err);
      }
      else if (numUpdated === 0) {
        cb(Boom.conflict('Fs at path already exists: '+fullpath));
      }
      else {
        if (data.isDir) {
          infraCodeVersion.findDir(fullpath, cb);
        }
        else {
          infraCodeVersion.findFile(fullpath, cb);
        }
      }
    });
  }
};

/** Update a file
 *  @params {string} fullpath Filename and path
 *  @params {string} data File content
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
InfraCodeVersionSchema.methods.updateFile = function (fullpath, body, cb) {
  var self = this;
  var bucket = this.bucket();
  async.waterfall([
    findFile,
    updateFile,
    updateModel
  ], cb);
  function findFile (cb) {
    self.findFile(fullpath, true, function (err, file) {
      if (err) {
        cb(err);
      }
      else if (!file) {
        cb(Boom.notFound('File not found: '+ fullpath));
      }
      else {
        cb(null, file);
      }
    });
  }
  function updateFile (file, cb) {
    bucket.updateFile(fullpath, body, function (err, fileData) {
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
      file.set('body', body, { strict: false });
      cb(null, file);
    });
  }
};

/** Move a file
 *  @params {string} fullpath Filename and path of source
 *  @params {object} data
 *  @params {string} data.path Path in user build files for destination
 *  @params {string} data.name Filename for destination
 *  @params {function} callback
 *  @returns {Array.object} File versions and ETags to return when creating new version (2) */
InfraCodeVersionSchema.methods.moveFs = function (fullpath, data, cb) {
  var self = this;
  var bucket = this.bucket();

  async.waterfall([
    bucketFind,
    bucketMove,
    mongoMove,
    findFs
  ], function (err, newFile) {
    if (err) { return cb(err); }
    cb(err, newFile);
  });

  var newFullpath;
  function bucketFind (cb) {
    self.findFs(fullpath, cb);
  }
  function bucketMove (fs, cb) {
    newFullpath = join(fs.path, data.name);
    if (fs.isDir) {
      self.findDirContents(fullpath, function (err, fsModels) {
        if (err) { return cb(err); }
        fsModels.push(fs);
        bucket.moveDir(fullpath, fsModels, newFullpath, cb);
      });
    }
    else {
      bucket.moveFile(fullpath, fs.VersionId, newFullpath, function (err, fsData) {
        if (err) { return cb(err); }
        fs.set(fsData);
        cb(null, fs);
      });
    }
  }
  function moveFile (file, cb) {
    InfraCodeVersion.update({
      _id: self._id,
      'files._id': file._id
    }, {
      $set: {
        'files.$': file.toJSON()
      }
    }, cb);
  }
  function moveDir (fsModels, cb) {
    self.removeDir(fullpath, function (err) {
      if (err) { return cb(err); }
      self.update({
        $pushAll: {
          files: fsModels
        }
      }, cb);
    });
  }
  function mongoMove (modelOrModels, cb) {
    if (Array.isArray(modelOrModels)) {
      var dirAndContents = modelOrModels;
      moveDir(dirAndContents, next);
    }
    else {
      var file = modelOrModels;
      moveFile(file, next);
    }
    function next (err) {
      cb(err); // pass err only
    }
  }
  function findFs (cb) {
    self.findFs(newFullpath, cb);
  }
};

/**
 * remove a file or directory
 * @param  {string}   filepath file path of the file or dir
 * @param  {Function} cb       callback
 */
InfraCodeVersionSchema.methods.removeFs = function (filepath, cb) {
  var self = this;
  this.findFs(filepath, function (err, fs) {
    if (err) {
      cb(err);
    }
    else if (!fs) {
      cb(Boom.notFound('Fs not found: '+filepath));
    }
    else if (fs.isDir) {
      self.removeDir(filepath, cb);
    }
    else {
      self.removeFile(filepath, cb);
    }
  });
};

/**
 * remove a dir and it's contents
 * @param  {string}   dirPath path of dir to remove
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.removeDir = function (dirPath, cb) {
  var dirKey = join(this.context.toString(), 'source', dirPath, '/');
  var regexp = new RegExp('^'+dirKey+'.*');
  this.update({
    $pull: {
      files: {
        Key: regexp
      }
    }
  }, cb);
};

/**
 * remove a file
 * @param  {string}   filepath path of file to remove
 * @param  {Function} cb       callback
 */
InfraCodeVersionSchema.methods.removeFile = function (filepath, cb) {
  if (last(filepath) === '/') {
    filepath = filepath.slice(0, -1);
  }
  var Key = join(this.context.toString(), 'source', filepath);
  this.update({
    $pull: {
      files: {
        Key: Key
      }
    }
  }, cb);
};

InfraCodeVersionSchema.methods.removeAllFiles = function (cb) {
  var Key = join(this.context.toString(), 'source/');
  var sourceFile = find(this.files, passAny(
    hasProperties({ Key: Key }),
    hasProperties({ Key: Key+'/' })
  ));
  this.update({
    $set: {
      files: [sourceFile]
    }
  }, cb);
};

InfraCodeVersionSchema.methods.copyFilesFrom = function (sourceInfraCodeVersionId, cb) {
  var self = this;
  async.waterfall([
    function (cb) {
      InfraCodeVersion.findById(sourceInfraCodeVersionId, function (err, infraCodeVersion) {
        if (err) {
          cb(err);
        } else if (!infraCodeVersion) {
          cb(Boom.notFound('Source InfraCodeVersion not found'));
        } else {
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

InfraCodeVersionSchema.methods.deleteFile = function (fullpath, cb) {
  var infraCodeVersion = this;
  var Key = join(this.context.toString(), 'source', fullpath);
  var file = find(this.files, passAny(
    hasProperties({ Key: Key }),
    hasProperties({ Key: Key+'/' })
  ));
  if (!file) {
    return cb(Boom.badRequest('File not found:' + fullpath));
  }
  infraCodeVersion.update({
    $pull: {
      files: {
        _id: file._id
      }
    }
  }, cb);
};

InfraCodeVersionSchema.methods.deleteSourceDir = function (cb) {
  var infraCodeVersion = this;
  this.deleteFile('/', function (err) {
    cb(err, infraCodeVersion);
  });
};

var InfraCodeVersion = module.exports = mongoose.model('InfraCodeVersion', InfraCodeVersionSchema);
