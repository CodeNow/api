'use strict';

var _ = require('lodash');
var async = require('async');
var error = require('error');
var join = require('path').join;
var mongoose = require('mongoose');
var unescape = require('querystring').unescape;
var url = require('url');

var aws = require('aws-sdk');
var configs = require('configs');
aws.config.update({
  accessKeyId: configs.S3.auth.accessKey,
  secretAccessKey: configs.S3.auth.secretKey
});
var s3 = new aws.S3();

var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

var ContextSchema = new Schema({
  name: {
    type: String,
    index: { unique: true }
  },
  displayName: { type: String },
  description: {
    type: String,
    'default': ''
  },
  dockerfile: { type: String },
  source: [{
    type: String,
    location: String
  }],
  owner: {
    type: ObjectId,
    index: true
  },
  versions: {
    type: [{
      tag: String,
      created: {
        type: Date,
        'default': Date.now,
        index: true
      }
    }],
    default: [{
      tag: 'v0',
      created: Date.now
    }]
  },
  parent: {
    type: ObjectId,
    index: true
  },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  tags: {
    type: [{
      channel: {
        type: ObjectId,
        index: { sparse: true }
      }
    }],
    'default': []
  }
});

_.extend(ContextSchema.methods, BaseSchema.methods);
_.extend(ContextSchema.statics, BaseSchema.statics);

ContextSchema.set('toJSON', { virtuals: true });

ContextSchema.methods.checkPathPermission = function (s3Url) {
  if (typeof s3Url === 'string') {
    s3Url = url.parse(s3Url);
  }
  // let's check to make sure the context is uploading to it's own bucket
  return s3Url.pathname.slice(1).split('/')[0] !== this._id.toString()
};

ContextSchema.methods.getResourceUrl = function (file) {
  var s3Key = join(this._id.toString(), 'source', file);
  return url.format({
    protocol: 's3:',
    slashes: true,
    host: configs.S3.contextResourceBucket,
    pathname: s3Key
  });
};

ContextSchema.methods.uploadResource = function (s3Url, content, callback) {
  s3Url = url.parse(s3Url);
  // let's check to make sure the context is uploading to it's own bucket
  if (this.checkPathPermission(s3Url)) {
    return callback(error(403, 'tried to upload the resource to an invalid location'));
  }
  var contentLength = content ? content.length : 0;
  var data = {
    Bucket: s3Url.hostname,
    Key: s3Url.pathname.slice(1), // remove '/' from the front
    Body: content,
    ContentLength: contentLength
  };
  s3.putObject(data, callback);
};

ContextSchema.methods.getResource = function (s3Url, callback) {
  s3Url = url.parse(s3Url);
  if (this.checkPathPermission(s3Url)) {
    return callback(error(403, 'tried to get a resource to an invalid location'));
  }
  var data = {
    Bucket: s3Url.hostname,
    Key: s3Url.pathname.slice(1),
    ResponseContentType: 'application/json'
  };
  s3.getObject(data, callback);
};

ContextSchema.methods.listResources = function (prefix, callback) {
  var s3Url = url.parse(this.getResourceUrl(prefix));
  // var data = {
  //   Bucket: s3Url.hostname,
  //   Prefix: s3Url.pathname.slice(1)
  // };
  // s3.listObjects(data, callback);
  var IsTruncated = true;
  var NextMarker = false;
  var allData = [];
  var lastData = [];

  async.whilst(
    isTruncated,
    downloadObjectList,
    combineAllData
  );

  function isTruncated () { return IsTruncated; }
  function downloadObjectList (callback) {
    var data = {
      Bucket: unescape(s3Url.hostname),
      Prefix: unescape(s3Url.path.slice(1))
    };
    if (NextMarker) {
      data.Marker = NextMarker;
    }
    s3.listObjects(data, function (err, results) {
      if (err) {
        return callback(err);
      }
      IsTruncated = results.IsTruncated;
      NextMarker = IsTruncated ? _.last(results.Contents).Key : false;
      allData.push.apply(allData, results.Contents);
      delete results.Contents;
      lastData = results;
      callback();
    });
  }
  function combineAllData (err) {
    if (err) {
      return callback(err);
    }
    lastData.Contents = allData;
    callback(null, lastData);
  }
};

ContextSchema.methods.createSourceDirectory = function (callback) {
  var self = this;
  if (!this.source.length) {
    // we haven't created a source directory yet!
    var source = {
      type: 'local',
      location: self.getResourceUrl('/')
    };
    this.source.push(source);

    async.parallel({
      upload: self.uploadResource.bind(self, source.location, null),
      save: this.save.bind(this)
    }, function (err, results) {
      if (results.save) {
        self = results.save.shift();
      }
      callback(err, self);
    });
  } else {
    // then we have a bucket! (only condition at the moment)
    if (this.source[0] && this.source[0].type === 'local') {
      callback(null, self);
    }
  }
};

ContextSchema.methods.uploadDockerfile = function (data, callback) {
  var tasks = {};
  var s3DockerfileUrl = this.dockerfile;
  if (!s3DockerfileUrl) {
    var s3Key = join(this._id.toString(), 'dockerfile', 'Dockerfile');
    var dockerfileUrl = url.format({
      protocol: 's3:',
      slashes: true,
      host: configs.S3.contextResourceBucket,
      pathname: s3Key
    });
    this.dockerfile = dockerfileUrl;
    tasks.save = this.save.bind(this);
  }

  tasks.s3Upload = this.uploadResource.bind(this, this.dockerfile, data);

  var self = this;
  async.parallel(tasks, function (err, results) {
    if (results.save) {
      self = results.save.shift();
    }
    callback(err, self);
  });
};

var Context = module.exports = mongoose.model('Contexts', ContextSchema);
