var __indexOf = [].indexOf;
var async = require('async');
var configs = require('../configs');
var error = require('../error');
var exts = require('../extensions');
var path = require('path');
var mongoose = require('mongoose');
var request = require('request');
var sync = require('./sync');
var uuid = require('node-uuid');
var volumes = require('./volumes');
var implementations = require('./implementations');
var _ = require('lodash');
var Channel = require('./channels');
var utils = require('../middleware/utils');
var proxy;
if (configs.dockworkerProxy) {
  proxy = configs.dockworkerProxy;
}
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var containerSchema = new Schema({
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
containerSchema.set('toJSON', { virtuals: true });
containerSchema.set('autoIndex', true);
containerSchema.index({
  saved: 1,
  created: 1
});
containerSchema.index({
  tags: 1,
  parent: 1
});
var encodedObjectIdProperties = ['_id', 'parent', 'target'];

// ensure decoding of encoded object ids before save
encodedObjectIdProperties
  .forEach(function (property) {
    containerSchema.path(property).set(function (val) {
      if (!val) {
        return val;
      }
      var oid = utils.decodeId(val);
      return utils.isObjectId(oid) ? oid : val;
    });
  });

containerSchema.methods.returnJSON = function (cb) {
  var json = this.encodeJSON();
  this.getTags(function (err, tags) {
    if (err) {
      return cb(err);
    }
    json.tags = tags;
    cb(null, json);
  });
};

containerSchema.methods.encodeJSON = function () {
  var json = this.toJSON();
  encodedObjectIdProperties.forEach(function (key) {
    var val = json[key];
    json[key] = val ? utils.encodeId(val) : val;
  });
  return json;
};

containerSchema.methods.getTags = function (cb) {
  if (!this.tags) {
    return cb();
  }
  var channelIds = this.tags.map(utils.pick('_id'));
  async.map(channelIds, Channel.findById, cb);
};

containerSchema.methods.inheritFromImage = function (image) {
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
};

//OLD
containerSchema.statics.create = function (domain, owner, image, data, cb) {
  var self = this;
  if (typeof data === 'function') {
    cb = data;
    data = {};
  }
  data = data != null ? data : {};
  image.sync(domain, function () {
    var servicesToken = 'services-' + uuid.v4();
    var env = [
      'RUNNABLE_USER_DIR=' + image.file_root,
      'RUNNABLE_SERVICE_CMDS=' + image.service_cmds,
      'RUNNABLE_START_CMD=' + image.start_cmd,
      'RUNNABLE_BUILD_CMD=' + image.build_cmd,
      'SERVICES_TOKEN=' + servicesToken,
      'APACHE_RUN_USER=www-data',
      'APACHE_RUN_GROUP=www-data',
      'APACHE_LOG_DIR=/var/log/apache2',
      'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    ];
    var createContainer = function (env, subdomain) {
      var container = new self({
        parent: image,
        name: image.name,
        owner: owner,
        description: image.description,
        port: image.port,
        cmd: image.cmd,
        image: image.image,
        file_root: image.file_root,
        service_cmds: image.service_cmds,
        start_cmd: image.start_cmd,
        build_cmd: image.build_cmd,
        output_format: image.output_format,
        servicesToken: servicesToken,
        webToken: 'web-' + uuid.v4(),
        specification: image.specification
      });
      image.files.forEach(function (file) {
        container.files.push(file.toJSON());
      });
      image.tags.forEach(function (tag) {
        container.tags.push(tag.toJSON());
      });
      var repo = getRepo();
      _.extend(container, data);
      request({
        url: '' + configs.harbourmaster + '/containers',
        method: 'POST',
        pool: false,
        json: {
          servicesToken: container.servicesToken,
          webToken: container.webToken,
          subdomain: subdomain,
          Env: env,
          Hostname: 'runnable',
          Image: '' + configs.dockerRegistry + '/runnable/' + repo,
          PortSpecs: [container.port.toString()],
          Cmd: [container.cmd]
        }
      }, domain.intercept(function (res) {
        if (res.statusCode > 300) {
          return cb(error(res.statusCode, res.body));
        }
        container.save(domain.intercept(function () {
          cb(null, container);
        }));
      }));
      function getRepo () {
        var repo;
        if (image.revisions && image.revisions.length) {
          var length = image.revisions.length;
          var revision = image.revisions[length - 1];
          repo = encodeId(revision.repo ? revision.repo : revision._id.toString());
        } else {
          repo = encodeId(image._id.toString());
        }
        return repo;
      }
    };
    if (image.specification != null) {
      implementations.findOne({
        owner: owner,
        'implements': image.specification
      }, domain.intercept(function (implementation) {
        if (implementation != null) {
          var envFull = env.concat(implementation.toJSON().requirements.map(function (requirement) {
            return '' + requirement.name + '=' + requirement.value;
          }));
          envFull.push('BASE_URL=http://' + implementation.subdomain + '.' + configs.domain);
          createContainer(envFull, implementation.subdomain);
        } else {
          createContainer(env);
        }
      }));
    } else {
      createContainer(env);
    }
  });
};
containerSchema.statics.destroy = function (domain, id, cb) {
  var self = this;
  this.findOne({ _id: id }, domain.intercept(function (container) {
    if (!container) {
      cb(error(404, 'container not found'));
    } else {
      request({
        url: '' + configs.harbourmaster + '/containers/' + container.servicesToken,
        method: 'DELETE',
        pool: false
      }, domain.intercept(function (res) {
        self.remove({ _id: id }, domain.intercept(function () {
          return cb();
        }));
      }));
    }
  }));
};
containerSchema.statics.listSavedContainers = function (domain, cb) {
  var timeout = new Date().getTime() - configs.containerTimeout;
  this.find({
    $or: [
      { saved: true },
      { created: { $gte: timeout } }
    ]
  }, { owner: 1, servicesToken: 1 }, domain.intercept(cb));
};
containerSchema.methods.updateRunOptions = function (domain, cb) {
  var self = this;
  var operations = [
    self.updateBuildCommand.bind(self, domain),
    self.updateStartCommand.bind(self, domain)
  ];
  if (this.specification != null) {
    operations.push(self.updateEnvVariables.bind(self, domain));
  }
  async.parallel(operations, cb);
};
containerSchema.methods.updateEnvVariables = function (domain, cb) {
  var encodedId = encodeId(this._id);
  implementations.updateEnvBySpecification(domain, {
    userId: this.owner,
    specification: this.specification,
    containerId: encodedId
  }, cb);
};
containerSchema.methods.updateBuildCommand = function (domain, cb) {
  var url = 'http://' + this.servicesToken + '.' + configs.domain + '/api/buildCmd';
  request.post({
    url: url,
    pool: false,
    json: this.build_cmd,
    proxy: proxy
  }, domain.intercept(function () {
    cb();
  }));
};
containerSchema.methods.updateStartCommand = function (domain, cb) {
  var url = 'http://' + this.servicesToken + '.' + configs.domain + '/api/cmd';
  request.post({
    url: url,
    pool: false,
    json: this.start_cmd,
    proxy: proxy
  }, domain.intercept(function () {
    cb();
  }));
};
containerSchema.methods.listFiles = function (domain, content, dir, default_tag, path, cb) {
  var files = [];
  if (default_tag) {
    content = true;
    this.files.forEach(function (file) {
      if (file['default'] && (!path || file.path === path)) {
        files.push(file.toJSON());
      }
    });
  } else if (dir) {
    this.files.forEach(function (file) {
      if (file.dir && (!path || file.path === path)) {
        files.push(file.toJSON());
      }
    });
  } else {
    this.files.forEach(function (file) {
      if (!path || file.path === path) {
        files.push(file.toJSON());
      }
    });
  }
  if (!content) {
    files.forEach(function (file) {
      delete file.content;
    });
  }
  cb(null, files);
};
var cacheContents = function (ext) {
  var _ref; //bwa??
  return _ref = ext.toLowerCase(), __indexOf.call(exts, _ref) >= 0;
};
containerSchema.methods.syncFiles = function (domain, cb) {
  var self = this;
  sync(domain, this.servicesToken, this, domain.intercept(function () {
    self.last_write = new Date();
    self.save(domain.intercept(function () {
      cb(null, self);
    }));
  }));
};
containerSchema.methods.createFile = function (domain, name, filePath, content, cb) {
  var self = this;
  filePath = path.normalize(filePath);
  if (typeof content === 'string') {
    volumes.createFile(domain, this.servicesToken, this.file_root, name, filePath, content, domain.intercept(function () {
      var file = {
        path: filePath,
        name: name
      };
      var ext = path.extname(name);
      if (cacheContents(ext)) {
        file.content = content;
      }
      self.files.push(file);
      file = self.files[self.files.length - 1]; //   O_o
      self.last_write = new Date();
      self.save(domain.intercept(function () {
        cb(null, {
          _id: file._id,
          name: name,
          path: filePath
        });
      }));
    }));
  } else {
    volumes.streamFile(domain, this.servicesToken, this.file_root, name, filePath, content, domain.intercept(function () {
      var file = {
        path: filePath,
        name: name
      };
      var ext = path.extname(name);
      if (cacheContents(ext)) {
        volumes.readFile(domain, self.servicesToken, self.file_root, name, filePath, domain.intercept(function (file_content) {
          file.content = file_content;
          self.files.push(file);
          file = self.files[self.files.length - 1];
          self.last_write = new Date();
          self.save(domain.intercept(function () {
            cb(null, {
              _id: file._id,
              name: file.name,
              path: file.path,
              content: file.content
            });
          }));
        }));
      } else {
        self.files.push(file);
        file = self.files[self.files.length - 1];
        self.last_write = new Date();
        self.save(domain.intercept(function () {
          cb(null, {
            _id: file._id,
            name: file.name,
            path: file.path
          });
        }));
      }
    }));
  }
};
containerSchema.methods.updateFile = function (domain, fileId, content, cb) {
  var self = this;
  var file = this.files.id(fileId);
  if (!file) {
    cb(error(404, 'file does not exist'));
  } else {
    volumes.updateFile(domain, this.servicesToken, this.file_root, file.name, file.path, content, domain.intercept(function () {
      var ext = path.extname(file.name);
      if (cacheContents(ext)) {
        file.content = content;
      }
      self.last_write = new Date();
      self.save(domain.intercept(function () {
        cb(null, file);
      }));
    }));
  }
};
containerSchema.methods.updateFileContents = function (domain, filePath, content, cb) {
  var self = this;
  var foundFile = null;
  filePath = path.normalize(filePath);
  this.files.forEach(function (file) {
    var elemPath = path.normalize('' + file.path + '/' + file.name);
    if (elemPath === filePath) {
      foundFile = file;
    }
  });
  if (!foundFile) {
    cb(error(404, 'file does not exist'));
  } else {
    volumes.streamFile(domain, this.servicesToken, this.file_root, foundFile.name, foundFile.path, content, domain.intercept(function () {
      var ext = path.extname(foundFile.name);
      if (cacheContents(ext)) {
        volumes.readFile(domain, self.servicesToken, self.file_root, foundFile.name, foundFile.path, domain.intercept(function (file_content) {
          foundFile.content = file_content;
          self.last_write = new Date();
          self.save(domain.intercept(function () {
            cb(null, {
              _id: foundFile._id,
              name: foundFile.name,
              path: foundFile.path
            });
          }));
        }));
      } else {
        self.last_write = new Date();
        self.save(domain.intercept(function () {
          cb(null, {
            _id: foundFile._id,
            name: foundFile.name,
            path: foundFile.path
          });
        }));
      }
    }));
  }
};
containerSchema.methods.renameFile = function (domain, fileId, newName, cb) {
  var file, self = this;
  file = this.files.id(fileId);
  if (!file) {
    return cb(error(404, 'file does not exist'));
  } else {
    var oldName = file.name;
    file.name = newName;
    volumes.renameFile(domain, this.servicesToken, this.file_root, oldName, file.path, newName, domain.intercept(function () {
      if (file.dir) {
        renameDir();
      } else {
        renameFile();
      }
    }));
  }
  function renameDir () {
    var oldPath = path.normalize('' + file.path + '/' + oldName);
    var newPath = path.normalize('' + file.path + '/' + newName);
    var _ref = self.files;
    for (var _i = 0, _len = _ref.length; _i < _len; _i++) {
      var elem = _ref[_i];
      if (elem.path.indexOf(oldPath) === 0 && elem._id !== file._id) {
        elem.path = elem.path.replace(oldPath, newPath);
      }
    }
    self.last_write = new Date();
    self.save(domain.intercept(function () {
      cb(null, file);
    }));
  }
  function renameFile () {
    var oldCached = cacheContents(path.extname(oldName));
    var newCached = cacheContents(path.extname(newName));
    if (oldCached && !newCached) {
      file.content = void 0;
      file['default'] = false;
    }
    if (!oldCached && newCached) {
      volumes.readFile(domain, self.servicesToken, self.file_root, file.name, file.path, domain.intercept(function (content) {
        file.content = content;
        self.last_write = new Date();
        self.save(domain.intercept(function () {
          cb(null, file);
        }));
      }));
    } else {
      self.last_write = new Date();
      self.save(domain.intercept(function () {
        cb(null, file);
      }));
    }
  }
};
containerSchema.methods.moveFile = function (domain, fileId, newPath, cb) {
  var file, self = this;
  file = this.files.id(fileId);
  newPath = path.normalize(newPath);
  if (!file) {
    cb(error(404, 'file does not exist'));
  } else {
    volumes.moveFile(domain, this.servicesToken, this.file_root, file.name, file.path, newPath, domain.intercept(function () {
      var oldPath = file.path;
      file.path = newPath;
      if (file.dir) {
        oldPath = path.normalize('' + oldPath + '/' + file.name);
        newPath = path.normalize('' + newPath + '/' + file.name);
        self.files.forEach(function (otherFile) {
          if (otherFile.path.indexOf(oldPath) === 0 && otherFile._id !== file._id) {
            otherFile.path = otherFile.path.replace(oldPath, newPath);
          }
        });
      }
      self.last_write = new Date();
      self.save(domain.intercept(function () {
        cb(null, file);
      }));
    }));
  }
};
containerSchema.methods.createDirectory = function (domain, name, path, cb) {
  var self = this;
  volumes.createDirectory(domain, this.servicesToken, this.file_root, name, path, domain.intercept(function () {
    self.files.push({
      path: path,
      name: name,
      dir: true
    });
    var file = self.files[self.files.length - 1];
    self.last_write = new Date();
    self.save(domain.intercept(function () {
      cb(null, file);
    }));
  }));
};
containerSchema.methods.readFile = function (domain, fileId, cb) {
  var file = this.files.id(fileId);
  if (!file) {
    cb(error(404, 'file does not exist'));
  } else {
    cb(null, file.toJSON());
  }
};
containerSchema.methods.tagFile = function (domain, fileId, isDefault, cb) {
  var file = this.files.id(fileId);
  if (!file) {
    cb(error(404, 'file does not exist'));
  } else {
    if (file.dir) {
      cb(error(403, 'cannot tag directory as default'));
    } else if (!file.content && isDefault) {
      cb(error(403, 'cannot tag an uncached file as default'));
    } else {
      file['default'] = isDefault;
      this.save(domain.intercept(function () {
        cb(null, file);
      }));
    }
  }
};
containerSchema.methods.deleteFile = function (domain, fileId, recursive, cb) {
  var self = this;
  var file = this.files.id(fileId);
  if (!file) {
    cb(error(404, 'file does not exist'));
  } else if (!file.dir) {
    volumes.deleteFile(domain, this.servicesToken, this.file_root, file.name, file.path, domain.intercept(function () {
      file.remove();
      self.last_write = new Date();
      self.save(domain.intercept(cb()));
    }));
  } else {
    volumes.removeDirectory(domain, this.servicesToken, this.file_root, file.name, file.path, recursive, domain.intercept(function () {
      if (recursive) {
        var match = path.normalize('' + file.path + '/' + file.name);
        self.files.forEach(function (file) {
          if (file.path.indexOf(match) === 0) {
            file.remove();
          }
        });
      }
      file.remove();
      self.last_write = new Date();
      self.save(domain.intercept(cb));
    }));
  }
};
containerSchema.methods.getMountedFiles = function (domain, fileId, mountDir, cb) {
  var file = this.files.id(fileId);
  if (!file) {
    cb(error(404, 'file does not exist'));
  } else if (!file.ignore) {
    return cb(error(403, 'entry is not a valid mount point'));
  } else {
    var subDir = path.normalize('' + file.path + '/' + file.name + '/' + mountDir);
    volumes.readDirectory(domain, this.servicesToken, this.file_root, subDir, exts, domain.intercept(cb));
  }
};
var plus = /\+/g;
var slash = /\//g;
var minus = /-/g;
var underscore = /_/g;
var encodeId = function (id) {
  return id;
};
var decodeId = function (id) {
  return id;
};
if (configs.shortProjectIds) {
  encodeId = function (id) {
    return new Buffer(id.toString(), 'hex').toString('base64').replace(plus, '-').replace(slash, '_');
  };
  decodeId = function (id) {
    return new Buffer(id.toString().replace(minus, '+').replace(underscore, '/'), 'base64').toString('hex');
  };
}
var Container = module.exports = mongoose.model('Containers', containerSchema);