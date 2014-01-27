var async = require('async');
var configs = require('configs');
var mongoose = require('mongoose');
var uuid = require('node-uuid');
var _ = require('lodash');
var BaseSchema = require('models/BaseSchema');
var Channel = require('models/channels');
var utils = require('middleware/utils');
var proxy;
if (configs.dockworkerProxy) {
  proxy = configs.dockworkerProxy;
}
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var ContainerSchema = new Schema({
  name: { type: String },
  description: {
    type: String,
    'default': ''
  },
  owner: {
    type: ObjectId,
    index: true
  },
  parent: {
    type: ObjectId,
    index: true
  },
  child: { type: ObjectId },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  target: { type: ObjectId },
  image: { type: String },
  dockerfile: { type: String },
  cmd: { type: String },
  port: { type: Number },
  servicesToken: { type: String },
  webToken: { type: String },
  tags: {
    type: [{ channel: ObjectId }],
    'default': []
  },
  service_cmds: {
    type: String,
    'default': ''
  },
  output_format: { type: String },
  saved: {
    type: Boolean,
    'default': false,
    index: true
  },
  start_cmd: {
    type: String,
    'default': 'date'
  },
  build_cmd: {
    type: String,
    'default': ''
  },
  last_write: { type: Date },
  file_root: {
    type: String,
    'default': '/root'
  },
  file_root_host: {
    type: String,
    'default': './src'
  },
  files: {
    type: [{
      name: { type: String },
      path: { type: String },
      dir: { type: Boolean },
      ignore: { type: Boolean },
      content: { type: String },
      'default': {
        type: Boolean,
        'default': false
      }
    }],
    'default': []
  },
  specification: { type: ObjectId },
  status: {
    type: String,
    'default': 'Draft'
  },
  commit_error: {
    type: String,
    'default': ''
  }
});
ContainerSchema.set('toJSON', { virtuals: true });
ContainerSchema.set('autoIndex', true);
ContainerSchema.index({
  saved: 1,
  created: 1
});
ContainerSchema.index({
  tags: 1,
  parent: 1
});
var encodedObjectIdProperties = ['_id', 'parent', 'target'];

// ensure decoding of encoded object ids before save
encodedObjectIdProperties
  .forEach(function (property) {
    ContainerSchema.path(property).set(function (val) {
      if (!val) {
        return val;
      }
      var oid = utils.decodeId(val);
      return utils.isObjectId(oid) ? oid : val;
    });
  });

_.extend(ContainerSchema.methods, BaseSchema.methods);
_.extend(ContainerSchema.statics, BaseSchema.statics);

ContainerSchema.methods.returnJSON = function (cb) {
  var json = this.encodeJSON();
  this.getTags(function (err, tags) {
    if (err) {
      return cb(err);
    }
    json.tags = tags;
    cb(null, json);
  });
};

ContainerSchema.methods.encodeJSON = function () {
  var json = this.toJSON();
  encodedObjectIdProperties.forEach(function (key) {
    var val = json[key];
    json[key] = val ? utils.encodeId(val) : val;
  });
  return json;
};

ContainerSchema.methods.getTags = function (cb) {
  if (!this.tags) {
    return cb();
  }
  async.map(this.tags, function (tag, cb) {
    Channel.findById(tag.channel).lean().exec(function (err, channel) {
      if (err) {
        return cb(err);
      }
      tag = tag.toJSON();
      cb(null, _.extend(channel, tag));
    });
  }, cb);
};

ContainerSchema.methods.tagWithChannel = function (channel, cb) {
  var channelId = channel._id ? channel._id : channel;
  var query = {
    _id: this._id,
    'tags.channel' : { $ne: channelId }
  };
  var update = {
    $push: {
      tags: { channel: channelId }
    }
  };
  var self = this;
  Container.findOneAndUpdate(query, update, function (err, updatedContainer) {
    if (err) {
      return cb(err);
    }
    cb(null, updatedContainer || this);
  });
};

ContainerSchema.methods.inheritFromImage = function (image, cb) {
  var attributes = [
    'name',
    'description',
    'tags',
    'files',
    'image',
    'dockerfile',
    'file_root',
    'file_root_host',
    'cmd',
    'build_cmd',
    'start_cmd',
    'service_cmds',
    'port',
    'output_format',
    'specification'
  ];
  if (image.toJSON) {
    image = image.toJSON();
  }
  this.set(_.pick(image, attributes));
  this.set({
    parent: image._id,
    servicesToken: 'services-' + uuid.v4(),
    webToken: 'web-' + uuid.v4(),
  });
  this.env = [
    'RUNNABLE_USER_DIR=' + image.file_root,
    'RUNNABLE_SERVICE_CMDS=' + image.service_cmds,
    'RUNNABLE_START_CMD=' + image.start_cmd,
    'RUNNABLE_BUILD_CMD=' + image.build_cmd,
    'SERVICES_TOKEN=' + this.servicesToken,
    'APACHE_RUN_USER=www-data',
    'APACHE_RUN_GROUP=www-data',
    'APACHE_LOG_DIR=/var/log/apache2',
    'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  ];
  if (cb) {
    cb(null, this);
  }
};

var Container = module.exports = mongoose.model('Containers', ContainerSchema);