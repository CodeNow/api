var _ = require('lodash');
var async = require('async');
var join = require('path').join;
var mongoose = require('mongoose');
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
  versions: [{
    tag: String,
    created: {
      type: Date,
      'default': Date.now,
      index: true
    }
  }],
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

ContextSchema.methods.getResourceUrl = function (file) {
  var s3Key = join(this._id.toString(), 'source', file);
  if (file === 'Dockerfile') {
    // this file is in a seperate folder, so just catch it here...
    s3Key = join(this._id.toString(), 'dockerfile', 'Dockerfile');
  }
  return url.format({
    protocol: 's3:',
    slashes: true,
    host: configs.S3.contextResourceBucket,
    pathname: s3Key
  });
};

ContextSchema.methods.uploadResource = function (key, content, callback) {
  var contentLength = content ? content.length : 0;
  var data = {
    Bucket: configs.S3.contextResourceBucket,
    Key: key,
    Body: content,
    ContentLength: contentLength
  };
  s3.putObject(data, callback);
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
    var s3Key = join(this._id.toString(), 'source', '/');

    async.parallel({
      upload: self.uploadResource.bind(self, s3Key, null),
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
  var s3Key = join(this._id.toString(), 'dockerfile', 'Dockerfile');
  if (!s3DockerfileUrl) {
    this.dockerfile = this.getResourceUrl('Dockerfile');
    tasks.save = this.save.bind(this);
  }

  tasks.s3Upload = this.uploadResource.bind(this, s3Key, data);

  var self = this;
  async.parallel(tasks, function (err, results) {
    if (results.save) {
      self = results.save.shift();
    }
    callback(err, self);
  });
};

var Context = module.exports = mongoose.model('Contexts', ContextSchema);
