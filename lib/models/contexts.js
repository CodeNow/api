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

ContextSchema.methods.createSourceDirectory = function (callback) {
  var self = this;
  if (!this.source.length) {
    // we haven't created a source directory yet!
    var s3Key = join(this._id.toString(), 'source/');
    var urlData = {
      protocol: 's3:',
      slashes: true,
      host: configs.S3.contextResourceBucket,
      pathname: s3Key
    };
    this.source.push({
      type: 'local',
      location: url.format(urlData)
    });

    async.parallel({
      upload: s3.putObject.bind(s3, {
        Bucket: configs.S3.contextResourceBucket,
        Key: s3Key,
        Body: null,
        ContentLength: 0
      }),
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
    s3DockerfileUrl = url.format({
      protocol: 's3:',
      slashes: true,
      host: configs.S3.contextResourceBucket,
      pathname: s3Key
    });
    this.dockerfile = s3DockerfileUrl;
    tasks.save = this.save.bind(this);
  }

  tasks.s3Upload = s3.putObject.bind(s3, {
    Bucket: configs.S3.contextResourceBucket,
    Key: s3Key,
    Body: data
  });
  var self = this;
  async.parallel(tasks, function (err, results) {
    if (results.save) {
      self = results.save.shift();
    }
    callback(err, self);
  });
};

var Context = module.exports = mongoose.model('Contexts', ContextSchema);
