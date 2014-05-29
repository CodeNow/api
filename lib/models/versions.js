'use strict';

var extend = require('lodash').extend;
var Boom = require('dat-middleware').Boom;
var BuildFilesBucket = require('./build-files-bucket');
var findIndex = require('101/find-index');
var hasProperties = require('101/has-properties');

var mongoose = require('mongoose');
var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** @alias module:models/version */
var VersionSchema = new Schema({
  // the ID of this object will be the docker tag
  name: { type: String },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  context: ObjectId,
  dockerfile: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }]
  },
  files: {
    type: [{
      Key: String,
      ETag: String,
      VersionId: String
    }],
    'default': []
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
  var files = this.files;
  var fileIndex = findIndex(files, hasProperties({ Key: key }));
  if (fileIndex === -1) {
    return cb(Boom.badRequest('invalid resource key: ' + key));
  }
  var file = files[fileIndex];
  var bucket = this.buildFilesBucket();
  bucket.getFile(file.Key, file.VersionId, file.ETag, cb);
};

VersionSchema.methods.addFile = function (key, body, cb) {
  var bucket = this.buildFilesBucket();
  bucket.createFile(key, body, cb);
};

VersionSchema.methods.buildFilesBucket = function () {
  return new BuildFilesBucket(this.context);
};

module.exports = mongoose.model('Versions', VersionSchema);
