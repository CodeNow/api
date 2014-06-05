'use strict';

var async = require('async');
var extend = require('lodash').extend;
var Boom = require('dat-middleware').Boom;
var BuildFilesBucket = require('models/apis/build-files-bucket');
var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');

var path = require('path');
var join = path.join;

var mongoose = require('mongoose');
var BaseSchema = require('models/mongo/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/version */
var VersionSchema = new Schema({
  // the ID of this object will be the docker tag
  name: { type: String },
  owner: ObjectId,
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  context: ObjectId,
  dockerfile: {
    type: {
      Key: String,
      ETag: String,
      VersionId: String
    }
  },
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }],
    'default': []
  },
  build: {
    dockerImage: {
      type: String
    },
    dockerTag: {
      type: String
    }
  }
});

extend(VersionSchema.methods, BaseSchema.methods);
extend(VersionSchema.statics, BaseSchema.statics);

VersionSchema.set('toJSON', { virtuals: true });

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

VersionSchema.methods.getFile = function (key, cb) {
  var fullKey = join(this._id.toString(), 'source', key);
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

VersionSchema.methods.addFile = function (data, cb) {
  var bucket = this.buildFilesBucket();
  var key = join(data.path, data.name);
  var body = data.body;
  bucket.createFile(key, body, cb);
};

VersionSchema.methods.updateFile = function (key, data, cb) {
  var bucket = this.buildFilesBucket();
  bucket.updateFile(key, data, cb);
};

VersionSchema.methods.moveFile = function (key, data, cb) {
  var fullKey = join(this._id.toString(), 'source', key);
  var fileIndex = findIndex(this.files, hasProperties({ Key: fullKey }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('(move) invalid resource key: ' + key));
  }
  var file = this.files[fileIndex];
  var bucket = this.buildFilesBucket();

  async.waterfall([
    bucket.getFile.bind(bucket, key, file.VersionId, file.ETag),
    removeFile,
    createFile
  ], function (err, deleteMarker, newFileData) {
    if (err) { return cb(err); }
    cb(err, [deleteMarker, newFileData]);
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
};

VersionSchema.methods.buildFilesBucket = function () {
  return new BuildFilesBucket(this.context);
};

module.exports = mongoose.model('Versions', VersionSchema);
