/**
 * @module lib/models/mongo/infra-code-version
 */
'use strict';

var Boom = require('dat-middleware').Boom;
var async = require('async');
var hasher = require('hasher'); // in lib
var isFunction = require('101/is-function');
var jsonHash = require('json-stable-stringify');
var last = require('101/last');
var mongoose = require('mongoose');
var path = require('path');
var pick = require('101/pick');
var regexpQuote = require('regexp-quote');
var uuid = require('uuid');
var Stream = require('stream');

var BuildFilesBucket = require('models/apis/build-files');
var InfraCodeVersionSchema = require('models/mongo/schemas/infra-code-version');
var logger = require('middlewares/logger')(__filename);

var join = path.join;
var log = logger.log;

/**
 * create a map of file hashes with filepath as key
 * @param  {ObjectId} id infraCodeVersion id
 * @param  {Function} cb callback(err, hash);
 */
InfraCodeVersionSchema.statics.findByIdAndGetHash = function(id, cb) {
  log.info({
    tx: true
  }, 'InfraCodeVersionSchema.statics.findByIdAndGetHash');
  InfraCodeVersion.findById(id, function(err, infraCodeVersion) {
    if (err) {
      log.error({
        err: err,
        tx: true
      }, 'InfraCodeVersionSchema.statics.findByIdAndGetHash: ICV.findById error');
      return cb(err);
    }
    log.trace({
      tx: true
    },
      'InfraCodeVersionSchema.statics.findByIdAndGetHash: getHash ICV.findById success');
    var hashMap = {};
    var invalidate = false;
    infraCodeVersion.files.forEach(function(item) {
      var filePath = item.Key.substr(item.Key.indexOf('/'));
      if (item.isDir) {
        // ensure dirs have some hash
        hashMap[filePath] = '1';
      } else if (item.hash) {
        hashMap[filePath] = item.hash;
      } else {
        // file without hash. this should not happen.
        // skip dedup by returning something that will never match
        invalidate = true;
      }
    });
    if (invalidate) {
      cb(null, uuid());
    } else {
      hasher(jsonHash(hashMap), cb);
    }
  });
};

InfraCodeVersionSchema.methods.bucket = function() {
  return new BuildFilesBucket(this.context);
};

InfraCodeVersionSchema.methods.initWithDefaults = function(cb) {
  var self = this;
  this.bucket().createSourceDir(function(err, file) {
    if (err) {
      return cb(err);
    }
    self.files = [file];
    cb(null, self);
  });
};

var copyFields = ['context', 'files'];
InfraCodeVersionSchema.statics.createCopyById = function(infraCodeVersionId, cb) {
  var InfraCodeVersion = this;
  InfraCodeVersion.findById(infraCodeVersionId, function(err, source) {
    var infraCodeVersion = new InfraCodeVersion(pick(source, copyFields));
    infraCodeVersion.parent = infraCodeVersionId;
    infraCodeVersion.edited = false;
    infraCodeVersion.save(cb);
  });
};
/**
 * find infraCodeVersoin with a single fs (file or dir)
 * @param  {ObjectId}   id   infraCodeVersion id
 * @param  {string}   path   path of the fs to find
 * @param  {Function} cb     callback
 */
InfraCodeVersionSchema.methods.findFs = function(path, cb) {
  var Key = join(this.context.toString(), 'source', path);
  var regexp = new RegExp('^' + regexpQuote(Key) + '(\/)?$', 'i');
  InfraCodeVersion.findOne({
    _id: this._id
  }, {
    files: {
      $elemMatch: {
        Key: regexp
      }
    }
  }, function(err, infraCodeVersion) {
    cb(err, infraCodeVersion && infraCodeVersion.files[0]);
  });
};

/**
 * find infraCodeVersoin with a single dir
 * @param  {ObjectId}   id      infraCodeVersion id
 * @param  {string}   dirPath path of the dir to find
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.findDir = function(dirPath, cb) {
  var Key = join(this.context.toString(), 'source', dirPath, '/');
  var regexp = new RegExp('^' + regexpQuote(Key) + '$', 'i');
  InfraCodeVersion.findOne({
    _id: this._id
  }, {
    files: {
      $elemMatch: {
        Key: regexp
      }
    }
  }, function(err, infraCodeVersion) {
    cb(err, infraCodeVersion && infraCodeVersion.files[0]);
  });
};
/**
 * find infraCodeVersoin with a single file
 * @param  {ObjectId}   id      infraCodeVersion id
 * @param  {string}   filepath path of the file to find
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.findFile = function(filepath, skipBody, cb) {
  if (last(filepath) === '/') {
    filepath = filepath.slice(0, -1);
  }
  if (isFunction(skipBody)) {
    cb = skipBody;
    skipBody = false;
  }
  var bucket = this.bucket();
  var Key = join(this.context.toString(), 'source', filepath);
  var regexp = new RegExp('^' + regexpQuote(Key) + '$', 'i');
  var file;
  InfraCodeVersion.findOne({
    _id: this._id
  }, {
    files: {
      $elemMatch: {
        Key: regexp
      }
    }
  }, function(err, infraCodeVersion) {
    if (err) {
      cb(err);
    } else if (!infraCodeVersion || !infraCodeVersion.files[0]) {
      cb(null, null);
    } else if (skipBody) {
      file = infraCodeVersion.files[0];
      cb(null, file);
    } else {
      file = infraCodeVersion.files[0];
      bucket.getFile(filepath, file.VersionId, file.ETag, function(err, data) {
        if (err) {
          return cb(err);
        }
        file.set('body', data.Body.toString(), {
          strict: false
        });
        cb(null, file);
      });
    }
  });
};
/**
 * find infraCodeVersion with files in a dir
 * @param  {ObjectId}   id      infraCodeVersion id
 * @param  {string}   dirPath full path of the directory
 * @param  {boolean}  recursive True to return all child files/folders, false if just 1 level
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.findDirContents = function(dirPath, recursive, cb) {
  var dirKey = join(this.context.toString(), 'source', dirPath, '/');
  var regexp = new RegExp('^' + regexpQuote(dirKey) + '[^\/]+(\/)?' + (recursive ? '' : '$'), 'i');
  var self = this;
  this.findDir(dirPath, function(err, dir) {
    if (err) {
      cb(err);
    } else if (!dir) {
      cb(Boom.notFound('Dir not found: ' + dirPath));
    } else {
      InfraCodeVersion.findById(self._id, function(err, infraCodeVersion) {
        if (err) {
          return cb(err);
        }
        infraCodeVersion.files = infraCodeVersion.files.filter(function(file) {
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
InfraCodeVersionSchema.methods.createFs = function(data, cb) {
  var infraCodeVersion = this;
  var bucket = this.bucket();
  async.waterfall([
    checkParentDirExists,
    checkForConflict,
    createInBucketAndHash,
    updateMongo
  ], cb);
  var fullpath = join(data.path, data.name);
  function checkParentDirExists(cb) {
    infraCodeVersion.findFs(data.path, function(err, fs) {
      if (err) {
        cb(err);
      } else if (!fs) {
        cb(Boom.notFound('Dir not found: ' + data.path));
      } else if (!fs.isDir) {
        cb(Boom.badRequest('Cannot create a file in a file'));
      } else {
        cb();
      }
    });
  }
  function checkForConflict(cb) {
    infraCodeVersion.findFs(fullpath, function(err, fs) {
      if (err) {
        cb(err);
      } else if (fs) {
        var type = fs.isDir ? 'Dir' : 'File';
        cb(Boom.conflict(type + ' already exists: ' + fullpath));
      } else {
        cb();
      }
    });
  }
  function createInBucketAndHash(cb) {
    if (last(fullpath) === '/' || data.isDir) {
      fullpath = join(fullpath, '/');
      bucket.createDir(fullpath, cb);
    } else {
      async.parallel([function s3Upload(cb) {
        bucket.createFile(fullpath, data.body, cb);
      }, function hash(cb) {
        var bodyIsStream = data.body instanceof Stream;
        if (!bodyIsStream) {
          hasher(
            data.body,
            !/^Dockerfile$/i.test(path.basename(fullpath)),
            cb);
        } else {
          cb(null, null);
        }
      }
      ], function(err, results) {
        log.trace({
          tx: true,
          err: err,
          results: results
        }, 'async.parallel');
        if (err) {
          log.error({
            tx: true,
            err: err
          }, 'createInBucketAndHash error');
          return cb(err);
        }
        cb(err, results[0], results[1]);
      });
    }
  }
  function updateMongo(s3Data, hash, cb) {
    /* jshint maxcomplexity:7 */
    if (isFunction(hash)) {
      cb = hash;
      hash = null;
    }
    log.trace({
      tx: true,
      s3Data: s3Data,
      hash: hash
    }, 'updateMongo');
    infraCodeVersion.files = infraCodeVersion.files || [];
    infraCodeVersion.files.push(s3Data);
    var fileData = infraCodeVersion.files.pop().toJSON();
    var fileKey;
    var dirKey;
    if (last(fileData.Key) === '/') {
      fileKey = fileData.Key.slice(0, -1);
      dirKey = fileData.Key;
      update();
    } else {
      fileKey = fileData.Key;
      dirKey = join(fileData.Key, '/');
      if (hash && !fileData.hash) {
        fileData.hash = hash;
      }
      if (data.fileType) {
        fileData.fileType = data.fileType;
      }
      update();
    }
    // atomic update
    function update() {
      InfraCodeVersion.update({
        _id: infraCodeVersion._id,
        'files.Key': {
          $nin: [fileKey, dirKey]
        }
      }, {
        $push: {
          files: fileData
        },
        $set: {
          edited: true
        }
      }, function(err, numUpdated) {
        if (err) {
          cb(err);
        } else if (numUpdated === 0) {
          cb(Boom.conflict('Fs at path already exists: ' + fullpath));
        } else {
          cb(null, fileData);
        }
      });
    }
  /* jshint maxcomplexity:6 */
  }
};

/** Update a file
 *  @params {string} fullpath Filename and path
 *  @params {string} data File content
 *  @params {function} callback
 *  @returns {object} File version and ETag to return when creating new version */
InfraCodeVersionSchema.methods.updateFile = function(fullpath, body, cb) {
  var self = this;
  var bucket = this.bucket();
  async.waterfall([
    findFile,
    updateFile,
    calcHash,
    updateModel
  ], cb);
  function findFile(cb) {
    self.findFile(fullpath, true, function(err, file) {
      if (err) {
        cb(err);
      } else if (!file) {
        cb(Boom.notFound('File not found: ' + fullpath));
      } else {
        cb(null, file);
      }
    });
  }
  function updateFile(file, cb) {
    bucket.updateFile(fullpath, body, function(err, fileData) {
      cb(err, file, fileData);
    });
  }
  function calcHash(file, fileData, cb) {
    hasher(body, function(err, hash) {
      if (err) {
        return cb(err);
      }
      fileData.hash = hash;
      cb(null, file, fileData);
    });
  }
  function updateModel(file, fileData, cb) {
    file.set(fileData);
    InfraCodeVersion.update({
      _id: self._id,
      'files._id': file._id
    }, {
      $set: {
        'files.$': file.toJSON(),
        edited: true
      }
    }, function(err) {
      if (err) {
        return cb(err);
      }
      file.set('body', body, {
        strict: false
      });
      cb(null, file);
    });
  }
};

/**
 * Creates a file with the given path if it doesn't exist, otherwise it updates
 * the file. This will return a bad request if the given filepath is a
 * directory.
 * @param {string} filepath Path to the file.
 * @param {string} body Body for the file.
 * @param {function} cb Callback to execute after the file has been upserted.
 */
InfraCodeVersionSchema.methods.upsertFs = function(filepath, body, cb) {
  var self = this;
  this.findFs(filepath, function(err, fs) {
    if (err) {
      cb(err);
    } else if (!fs) {
      var parts = filepath.split('/');
      var name = parts.pop();
      var path = parts.join('/');
      if (path === '') {
        path = '/';
      }
      self.createFs({
        name: name,
        path: path,
        body: body
      }, cb);
    } else if (fs.isDir) {
      cb(Boom.badRequest('Fs is a directory: ' + filepath));
    } else {
      self.updateFile(filepath, body, cb);
    }
  });
};

/** Move a file
 *  @params {string} fullpath Filename and path of source
 *  @params {object} data
 *  @params {string} data.path Path in user build files for destination
 *  @params {string} data.name Filename for destination
 *  @params {function} callback
 *  @returns {Array.object} File versions and ETags to return when creating new version (2) */
InfraCodeVersionSchema.methods.moveFs = function(fullpath, data, cb) {
  var self = this;
  var bucket = this.bucket();

  async.waterfall([
    bucketFind,
    checkIfConflict,
    bucketMove,
    mongoMove,
    findFs
  ], function(err, newFile) {
    if (err) {
      return cb(err);
    }
    cb(err, newFile);
  });

  var newFullpath;

  /**
   * Find the file we will be manipulating
   * @param cb
   */
  function bucketFind(cb) {
    self.findFs(fullpath, cb);
  }
  /**
   * Check if something already exists with the destination name
   * @param fs
   * @param cb
   */
  function checkIfConflict(fs, cb) {
    /*jshint maxcomplexity:6*/
    if (!fs) {
      return cb(Boom.notFound('Not found: ' + fullpath));
    }
    newFullpath = join(data.path || fs.path, data.name || fs.name);
    if (newFullpath[0] === '/') {
      newFullpath = newFullpath.slice(1);
    }
    if (fs.isDir) {
      newFullpath = join(newFullpath, '/');
    }
    self.findFs(newFullpath, function(err, existingFile) {
      // if existingFile exists, throw an error
      if (existingFile) {
        return cb(Boom.conflict('A ' + (existingFile.isDir ? 'folder' : 'file') + ' already ' +
          'exists with that name'));
      } else {
        cb(null, fs);
      }
    });
  }
  function moveFile(file, cb) {
    // atomic update
    InfraCodeVersion.update({
      _id: self._id,
      'files._id': file._id
    }, {
      $set: {
        'files.$': file.toJSON(),
        edited: true
      }
    }, function(err, numUpdated) {
      if (err) {
        cb(err);
      } else if (numUpdated === 0) {
        cb(Boom.conflict('Fs at path already exists: ' + fullpath));
      } else {
        cb();
      }
    });
  }
  function moveDir(fsModels, cb) {
    self.removeDir(fullpath, function(err) {
      if (err) {
        return cb(err);
      }
      self.update({
        $pushAll: {
          files: fsModels
        },
        $set: {
          edited: true
        }
      }, function(err, numUpdated) {
        if (err) {
          cb(err);
        } else if (numUpdated === 0) {
          cb(Boom.conflict('Fs at path already exists: ' + fullpath));
        } else {
          cb();
        }
      });
    });
  }
  function mongoMove(modelOrModels, cb) {
    if (Array.isArray(modelOrModels)) {
      var dirAndContents = modelOrModels;
      moveDir(dirAndContents, next);
    } else {
      var file = modelOrModels;
      moveFile(file, next);
    }
    function next(err) {
      cb(err); // pass err only
    }
  }
  function bucketMove(fs, cb) {
    if (fs.isDir) {
      fullpath = join(fullpath, '/');
      newFullpath = join(newFullpath, '/');
      self.findDirContents(fullpath, true, function(err, fsModels) {
        if (err) {
          return cb(err);
        }
        fsModels.push(fs);
        bucket.moveDir(fullpath, fsModels, newFullpath, cb);
      });
    } else {
      bucket.moveFile(fullpath, fs.VersionId, newFullpath, function(err, fsData) {
        if (err) {
          return cb(err);
        }
        fs.set(fsData);
        cb(null, fs);
      });
    }
  }
  function findFs(cb) {
    self.findFs(newFullpath, cb);
  }
};

/**
 * remove a file or directory
 * @param  {string}   filepath file path of the file or dir
 * @param  {Function} cb       callback
 */
InfraCodeVersionSchema.methods.removeFs = function(filepath, cb) {
  var self = this;
  this.findFs(filepath, function(err, fs) {
    if (err) {
      cb(err);
    } else if (!fs) {
      cb(Boom.notFound('Fs not found: ' + filepath));
    } else if (fs.isDir) {
      self.removeDir(filepath, cb);
    } else {
      self.removeFile(filepath, cb);
    }
  });
};

/**
 * remove a dir and it's contents
 * @param  {string}   dirPath path of dir to remove
 * @param  {Function} cb      callback
 */
InfraCodeVersionSchema.methods.removeDir = function(dirPath, cb) {
  var dirKey = join(this.context.toString(), 'source', dirPath, '/');
  var regexp = new RegExp('^' + regexpQuote(dirKey) + '.*', 'i');
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
InfraCodeVersionSchema.methods.removeFile = function(filepath, cb) {
  if (last(filepath) === '/') {
    filepath = filepath.slice(0, -1);
  }
  var Key = join(this.context.toString(), 'source', filepath);
  this.update({
    $pull: {
      files: {
        Key: Key
      }
    },
    $set: {
      edited: true
    }
  }, cb);
};

/**
 * remove the source dir
 * @param  {Function} cb callback
 */
InfraCodeVersionSchema.methods.removeSourceDir = function(cb) {
  this.removeDir('/', cb);
};

InfraCodeVersionSchema.methods.copyFilesFromSource = function(sourceInfraCodeVersionId, cb) {
  var self = this;
  async.waterfall([function(cb) {
    InfraCodeVersion.findById(sourceInfraCodeVersionId, function(err, infraCodeVersion) {
      if (err) {
        cb(err);
      } else if (!infraCodeVersion) {
        cb(Boom.notFound('Source InfraCodeVersion not found'));
      } else {
        cb(null, infraCodeVersion);
      }
    });
  },
    copyFiles, function(newFiles, cb) {
      // TODO: something was going bonkers here trying to just update it, but this seems to work
      self.files = newFiles;
      // Setting edited to true, since we should never let anyone use source icvs in builds
      self.edited = true;
      self.parent = sourceInfraCodeVersionId;
      self.save(cb);
    }
  ], function(err, myself) {
    log.trace({
      tx: true,
      err: err,
      myself: myself
    }, 'copyFilesFromSource');
    cb(err, myself);
  });

  function copyFiles(sourceVersion, callback) {
    var bucket = self.bucket();
    async.map(
      sourceVersion.files, function(file, cb) {
        // this protects the scope of bucket
        bucket.copyFileFrom(file, function(err, newFile) {
          if (err) {
            return cb(err);
          }
          newFile.hash = file.hash;
          cb(null, newFile);
        });
      },
      callback);
  }
};

var InfraCodeVersion = module.exports = mongoose.model('InfraCodeVersion', InfraCodeVersionSchema);
