var cp = require('child_process');
var configs = require('../configs');
var error = require('../error');
var fs = require('fs');
var mongoose = require('mongoose');
var mu = require('mu2');
var request = require('request');
var sync = require('./sync');
var uuid = require('node-uuid');
var _ = require('lodash');
var textSearch = require('mongoose-text-search');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var Channel = require('./channels');
var async = require('async');
var utils = require('../middleware/utils');
var imageSchema = new Schema({
  name: {
    type: String,
    index: { unique: true }
  },
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
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  image: { type: String },
  revisions: [{
    repo: String,
    created: {
      type: Date,
      'default': Date.now,
      index: true
    }
  }],
  dockerfile: { type: String },
  cmd: { type: String },
  copies: {
    type: Number,
    'default': 0,
    index: true
  },
  pastes: {
    type: Number,
    'default': 0,
    index: true
  },
  cuts: {
    type: Number,
    'default': 0,
    index: true
  },
  runs: {
    type: Number,
    'default': 0,
    index: true
  },
  views: {
    type: Number,
    'default': 0,
    index: true
  },
  votes: {
    type: Number,
    'default': 0,
    index: true
  },
  port: { type: Number },
  synced: { type: Boolean },
  tags: {
    type: [{
      channel: {
        type: ObjectId,
        index: { sparse: true }
      }
    }],
    'default': []
  },
  output_format: { type: String },
  service_cmds: {
    type: String,
    'default': ''
  },
  start_cmd: {
    type: String,
    'default': 'date'
  },
  build_cmd: {
    type: String,
    'default': ''
  },
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
      'default': {
        type: Boolean,
        'default': false
      },
      content: { type: String },
      ignore: { type: Boolean }
    }],
    'default': []
  },
  specification: {
    type: ObjectId,
    index: { sparse: true }
  }
});
imageSchema.plugin(textSearch);
imageSchema.set('toJSON', { virtuals: true });
imageSchema.index({
  name: {
    unique: true
  }
});
imageSchema.index({
  tags: 1,
  parent: 1
});
imageSchema.index({
  name: 'text',
  tags: 'text'
});
var encodedObjectIdProperties = ['_id', 'parent', 'target', 'child'];

imageSchema.methods.inheritFromContainer = function (container) {
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
    'parent',
    'specification'
  ];
  if (container.toJSON) {
    container = container.toJSON();
  }
  this.set(_.pick(container, attributes));
  this.revisions = [{ repo: container._id.toString() }];
};

imageSchema.methods.returnJSON = function (cb) {
  var json = this.encodeJSON();
  this.getTags(function (err, tags) {
    if (err) {
      return cb(err);
    }
    json.tags = tags;
    cb(null, json);
  });
};

imageSchema.methods.encodeJSON = function () {
  var json = this.toJSON();
  encodedObjectIdProperties.forEach(function (key) {
    var val = json[key];
    json[key] = val ? utils.encodeId(val) : val;
  });
  return json;
};

imageSchema.methods.getTags = function (cb) {
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

imageSchema.statics.findFirstImageInChannel = function (channelId) {
  var args = Array.prototype.slice.call(arguments, 1);
  var cb = args.pop();
  var query = { 'tags.channel': channelId };
  var fields = args[0] || null; // default: all fields
  var opts = _.extend(args[1] || {}, {
    sort: { _id: 1 },
    limit: 1
  });
  Image.find(query, fields, opts, function (err, images) {
    cb(err, images && images[0]);
  });
};

//OLD BELOW


var buildDockerImage = function (domain, fspath, tag, cb) {
  var child = cp.spawn('tar', [
    '-c',
    '--directory',
    fspath,
    '.'
  ]);
  var req = request.post({
    url: '' + configs.harbourmaster + '/build',
    headers: { 'content-type': 'application/tar' },
    qs: { t: tag },
    pool: false
  }, domain.intercept(function (res, body) {
    if (res.statusCode !== 200) {
      cb(error(res.statusCode, body));
    } else if (body.indexOf('Successfully built') === -1) {
      cb(error(400, 'could not build image from dockerfile'));
    } else {
      cb(null, tag);
    }
  }));
  child.stdout.pipe(req);
};
var syncDockerImage = function (domain, image, cb) {
  var servicesToken = 'services-' + uuid.v4();
  var encodedId;
  if (image.revisions && image.revisions.length) {
    var length = image.revisions.length;
    encodedId = encodeId(image.revisions[length - 1]._id.toString());
  } else {
    encodedId = encodeId(image._id.toString());
  }
  var imageTag = '' + configs.dockerRegistry + '/runnable/' + encodedId;
  request({
    pool: false,
    url: '' + configs.harbourmaster + '/containers',
    method: 'POST',
    json: {
      servicesToken: servicesToken,
      webToken: 'web-' + uuid.v4(),
      Env: [
        'RUNNABLE_USER_DIR=' + image.file_root,
        'RUNNABLE_SERVICE_CMDS=' + image.service_cmds,
        'RUNNABLE_START_CMD=' + image.start_cmd,
        'RUNNABLE_BUILD_CMD=' + image.build_cmd,
        'SERVICES_TOKEN=' + servicesToken,
        'APACHE_RUN_USER=www-data',
        'APACHE_RUN_GROUP=www-data',
        'APACHE_LOG_DIR=/var/log/apache2',
        'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      ],
      Hostname: image._id.toString(),
      Image: imageTag,
      PortSpecs: [image.port.toString()],
      Cmd: [image.cmd]
    }
  }, domain.intercept(function (res, body) {
    if (res.statusCode !== 204) {
      cb(error(res.statusCode, body));
    } else {
      sync(domain, servicesToken, image, domain.intercept(function () {
        request({
          pool: false,
          url: '' + configs.harbourmaster + '/containers/' + servicesToken,
          method: 'DELETE'
        }, domain.intercept(function (res) {
          if (res.statusCode !== 204) {
            cb(error(res.statusCode, body));
          } else {
            cb();
          }
        }));
      }));
    }
  }));
};
imageSchema.statics.createFromDisk = function (domain, owner, runnablePath, sync, cb) {
  var self = this;
  fs.exists('' + runnablePath + '/runnable.json', function (exists) {
    var err, runnable;
    if (!exists) {
      cb(error(400, 'runnable.json not found'));
    } else {
      try {
        runnable = require('' + runnablePath + '/runnable.json');
      } catch (_error) {
        err = _error;
        err = err;
      }
      if (err) {
        cb(error(400, 'runnable.json is not valid'));
      } else if (!runnable.name) {
        cb(error(400, 'runnable.json is not valid'));
      } else {
        fs.exists('' + runnablePath + '/Dockerfile', function (exists) {
          if (!exists) {
            cb(error(400, 'dockerfile not found'));
          } else {
            fs.readFile(runnablePath + '/Dockerfile', 'utf8',
              domain.intercept(function (dockerfile) {
                mu.compileText('Dockerfile', dockerfile, domain.intercept(function (compiled) {
                  var rendered = mu.render(compiled, {
                    file_root: runnable.file_root,
                    file_root_host: runnable.file_root_host,
                    image: runnable.image,
                    port: runnable.port
                  });
                  var writestream = fs.createWriteStream(runnablePath + '/Dockerfile', 'utf8');
                  writestream.on('error', domain.intercept(function () {}));
                  writestream.on('close', function () {
                    self.findOne({ name: runnable.name }, domain.intercept(function (existing) {
                      if (existing) {
                        cb(error(403, 'a runnable by that name already exists'));
                      } else {
                        console.log('umm');
                        var image = new self();
                        var encodedId = encodeId(image._id.toString());
                        var tag = '' + configs.dockerRegistry + '/runnable/' + encodedId;
                        buildDockerImage(domain, runnablePath, tag, domain.intercept(function () {
                          _.extend(image, runnable, {
                            owner: owner,
                            dockerfile: dockerfile
                          });
                          console.log('build');
                          runnable.tags = runnable.tags || [];
                          var _ref = runnable.files;
                          for (var _i = 0, _len = _ref.length; _i < _len; _i++) {
                            var file = _ref[_i];
                            image.files.push(file);
                          }
                          if (sync && false) {
                            syncDockerImage(domain, image, domain.intercept(function () {
                              console.log('sync');
                              image.synced = true;
                              image.save(domain.intercept(function () {
                                cb(null, image, runnable.tags);
                              }));
                            }));
                          } else {
                            image.save(domain.intercept(function () {
                              cb(null, image, runnable.tags);
                            }));
                          }
                        }));
                      }
                    }));
                  });
                  rendered.pipe(writestream);
                }));
              }));
          }
        });
      }
    }
  });
};
imageSchema.statics.createFromContainer = function (domain, container, cb) {
  var self = this;
  this.findOne({ name: container.name }, domain.intercept(function (existing) {
    if (existing) {
      cb(error(403, 'a shared runnable by that name already exists'));
    } else {
      var image = new self();
      copyPublishProperties(image, container);
      image.revisions = [];
      image.revisions.push({ repo: container._id.toString() });
      image.synced = true;
      container.child = image._id;
      container.save(domain.intercept(function () {
        image.save(domain.intercept(function () {
          cb(null, image);
        }));
      }));
    }
  }));
};
imageSchema.statics.countInChannelByOwner = function (domain, channelId, ownerId, cb) {
  this.count({
    'owner': ownerId,
    'tags.channel': channelId
  }, domain.intercept(function (count) {
    cb(null, count);
  }));
};
imageSchema.statics.search = function (domain, searchText, limit, cb) {
  var opts = {
    filter: { tags: { $not: { $size: 0 } } },
    project: {
      name: 1,
      description: 1,
      tags: 1,
      owner: 1,
      created: 1
    },
    limit: limit <= configs.defaultPageLimit ? limit : configs.defaultPageLimit
  };
  this.textSearch(searchText, opts, domain.intercept(function (output) {
    var images = output.results.map(function (result) {
      return result.obj;
    });
    cb(null, images);
  }));
};
imageSchema.statics.incVote = function (domain, runnableId, cb) {
  this.update({ _id: runnableId }, { $inc: { votes: 1 } }, domain.intercept(function (success) {
    cb(null, success);
  }));
};
imageSchema.methods.updateFromContainer = function (domain, container, cb) {
  var self = this;
  copyPublishProperties(self, container, true);
  self.revisions = self.revisions || [];
  self.revisions.push({ repo: container._id.toString() });
  container.child = self._id;
  container.save(domain.intercept(function () {
    self.save(domain.intercept(function () {
      cb(null, self);
    }));
  }));
};
imageSchema.statics.destroy = function (domain, id, cb) {
  var self = this;
  this.findOne({ _id: id }, domain.intercept(function (image) {
    if (!image) {
      cb(error(404, 'image not found'));
    } else {
      self.remove({ _id: id }, domain.intercept(function () {
        cb();
      }));
    }
  }));
};
imageSchema.statics.listTags = function (domain, cb) {
  this.find().distinct('tags.name', domain.intercept(function (tagNames) {
    cb(null, tagNames);
  }));
};
imageSchema.statics.relatedChannelIds = function (domain, channelIds, cb) {
  this.distinct('tags.channel', {
    'tags.channel': {
      $in: channelIds
    }
  }, domain.intercept(function (channelIds) {
    cb(null, channelIds);
  }));
};
imageSchema.statics.isOwner = function (domain, userId, runnableId, cb) {
  this.findOne({ _id: runnableId }, {
    _id: 1,
    owner: 1
  }, domain.intercept(function (image) {
    if (!image) {
      cb(error(404, 'runnable not found'));
    } else {
      cb(null, image.owner.toString() === userId.toString());
    }
  }));
};
imageSchema.methods.sync = function (domain, cb) {
  var self = this;
  if (this.synced) {
    cb();
  } else {
    syncDockerImage(domain, this, domain.intercept(function () {
      self.synced = true;
      self.save(domain.intercept(function () {
        cb();
      }));
    }));
  }
};
var plus = /\+/g;
var slash = /\//g;
var encodeId = function (id) {
  return new Buffer(id.toString(), 'hex').toString('base64').replace(plus, '-').replace(slash, '_');
};
var copyPublishProperties = function (image, container, noOwner) {
  var objectIdProperties, properties;
  properties = [
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
    'output_format'
  ];
  objectIdProperties = [
    'parent',
    'specification'
  ];
  if (!noOwner) {
    objectIdProperties.push('owner');
  }
  properties.forEach(function (property) {
    image[property] = _.clone(container[property]);
  });
  objectIdProperties.forEach(function (property) {
    image[property] = container[property] && container[property].toString();
  });
};
var Image = module.exports = mongoose.model('Images', imageSchema);