var _ = require('lodash');
var async = require('async');
var configs = require('configs');
var mongoose = require('mongoose');
// var uuid = require('node-uuid');
// var emailer = require('../emailer');
var BaseSchema = require('models/BaseSchema');

// var Channel = require('models/channels');
// var Image = require('models/images');
var User = require('models/users');

var utils = require('middleware/utils');
// var error = require('error');
// var fnProxy = require('function-proxy');
// var proxy;
// if (configs.dockworkerProxy) {
//   proxy = configs.dockworkerProxy;
// }
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var ContainerSchema = new Schema({
  // FIXME: remove commented out fields
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
  // child: { type: ObjectId },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  // target: { type: ObjectId },
  // image: { type: String },
  // dockerfile: { type: String },
  // cmd: { type: String },
  port: { type: Number },
  servicesToken: { type: String },
  webToken: { type: String },
  // importSource: { type: String },
  // tags: {
  //   type: [{ channel: ObjectId }],
  //   'default': []
  // },
  // service_cmds: {
  //   type: String,
  //   'default': ''
  // },
  // output_format: { type: String },
  // saved: {
  //   type: Boolean,
  //   'default': false,
  //   index: true
  // },
  // start_cmd: {
  //   type: String,
  //   'default': 'date'
  // },
  // build_cmd: {
  //   type: String,
  //   'default': ''
  // },
  // last_write: { type: Date },
  userDir: {
    type: String,
    'default': '$HOME'
  },
  // file_root_host: {
  //   type: String,
  //   'default': './src'
  // },
  // files: {
  //   type: [{
  //     name: { type: String },
  //     path: { type: String },
  //     dir: { type: Boolean },
  //     ignore: { type: Boolean },
  //     content: { type: String },
  //     'default': {
  //       type: Boolean,
  //       'default': false
  //     }
  //   }],
  //   'default': []
  // },
  // specification: { type: ObjectId },
  // status: {
  //   type: String,
  //   'default': 'Draft'
  // },
  // commit_error: {
  //   type: String,
  //   'default': ''
  // },
  containerId: {
    type: String
  },
  host: {
    type: String
  },
  // servicesPort: {
  //   type: String
  // },
  // webPort: {
  //   type: String
  // }
});
ContainerSchema.set('toJSON', { virtuals: true });
ContainerSchema.set('autoIndex', true);
// ContainerSchema.index({
//   saved: 1,
//   created: 1
// });
ContainerSchema.index({
  tags: 1,
  parent: 1
});
var encodedObjectIdProperties = ['_id', 'parent'];

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

/* Static Methods */

ContainerSchema.statics.findSavedOrActive = function (/*[fields][, opts][, cb]*/) {
  var args = Array.prototype.slice.call(arguments);
  var timeout = Date.now() - configs.containerTimeout;
  var query = {
    $or: [
      { saved: true },
      { created: { $gte: timeout } }
    ]
  };
  args.unshift(query);
  this.find.apply(this, args);
};

ContainerSchema.statics.getOwnersFor = function (containers, fields, cb) {
  var userIds = containers.map(function getOwnerId (container) {
    return container.owner.toString();
  });
  var query = { _id: { $in: userIds } };
  User.find(query, fields, attachOwners);
  var ownersHash = {};
  function attachOwners (err, owners) {
    if (err) {
      cb(err);
    }
    else {
      owners.forEach(function (owner) {
        ownersHash[owner._id] = owner;
      });
      containers.forEach(function (container) {
        container.ownerJSON = ownersHash[container.owner];
      });
      cb(null, containers);
    }
  }
};

/* Instance Methods */

ContainerSchema.methods.returnJSON = function (cb) {
  var json = this.encodeJSON();
  async.parallel({
    tags: this.getTags.bind(this)
  }, function (err, extend) {
    if (err) {
      cb(err);
    }
    else {
      _.extend(json, extend);
      cb(null, json);
    }
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

// FIXME: really? tags on containers
// ContainerSchema.methods.getTags = function (cb) {
//   if (!this.tags) {
//     return cb();
//   }
//   async.map(this.tags, function (tag, cb) {
//     Channel.findById(tag.channel).lean().exec(function (err, channel) {
//       if (err) {
//         return cb(err);
//       }
//       tag = tag.toJSON();
//       cb(null, _.extend(channel, tag));
//     });
//   }, cb);
// };

ContainerSchema.methods.getEnv = function () {
  // var container = this;
  // var stopUrl = [
  //   'http://api.', configs.domain,
  //   '/users/me/runnables/', utils.encodeId(container._id), '/stop'
  // ].join('');
  return [
    // FIXME: delete not required things.
    // 'RUNNABLE_USER_DIR=' + container.userDir,
    // 'RUNNABLE_SERVICE_CMDS=' + container.service_cmds,
    // 'RUNNABLE_START_CMD=' + container.start_cmd,
    // 'RUNNABLE_BUILD_CMD=' + container.build_cmd,
    'SERVICES_TOKEN=' + this.servicesToken,
    // 'APACHE_RUN_USER=www-data',
    // 'APACHE_RUN_GROUP=www-data',
    // 'APACHE_LOG_DIR=/var/log/apache2',
    // 'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    // 'STOP_URL=' + stopUrl
  ];
};

// FIXME: why would we ever tag containers with channels?
// ContainerSchema.methods.tagWithChannel = function (channel, cb) {
//   var channelId = channel._id || channel;
//   this.tags.push({ channel: channelId });
//   var tag = _.last(this.tags).toJSON();
//   var query = {
//     _id: this._id,
//     'tags.channel' : { $ne: channelId }
//   };
//   var update = {
//     $push: {
//       tags: tag
//     }
//   };
//   Container.findOneAndUpdate(query, update, function (err, updatedContainer) {
//     if (err) {
//       return cb(err);
//     }
//     if (!updatedContainer) {
//       return cb(error(400, 'container already tagged with '+channel.name));
//     }
//     cb(null, updatedContainer);
//   });
// };
// ContainerSchema.methods.removeTagById = function (tagId, cb) {
//   this.tags = this.tags.filter(function (tag) {
//     return !utils.equalObjectIds(tag._id, tagId);
//   });
//   var container = this;
//   this.save(function (err) {
//     cb(err, container);
//   });
// };

// FIXME: add child may not be required after rebuild...
// ContainerSchema.methods.addChild = function (image, cb) {
//   this.child = image._id.toString();
//   cb(null, this);
// };

// FIXME: shouldn't need this route any longer
// ContainerSchema.methods.atomicUpdateCommitStatusAndName = function (update, user, cb) {
//   // TODO: expand this to all statuses
//   var container = this;
//   var status = update.status;
//   var name = update.name || container.name;
//   if (status === 'Committing back') {
//     async.waterfall([
//       atomicStatusUpdate,
//       function (container, cb) {
//         if (!container) {
//           return cb();
//         }
//         container.checkDelistAction(user, cb);
//       }
//     ], cb);
//   }
//   else { // 'Committing new'
//     async.waterfall([
//       Image.findNameConflict.bind(Image, name),
//       atomicStatusUpdate
//     ], cb);
//   }
//   function atomicStatusUpdate (cb) {
//     var query = {
//       _id: container._id,
//       $or: [
//         { status: 'Draft' },          // status must be in initial state,
//         { commit_error: { $ne: '' } } // or have failed
//       ]
//     };
//     var updateSet = {
//       $set: {
//         name: name,
//         status: status,
//         commit_error: '' // default
//       }
//     };
//     var opts = {
//       fields: { files: 0 }
//     };
//     // if update unsuccessful, callsback null
//     Container.findOneAndUpdate(query, updateSet, opts, cb);
//   }
// };

// FIXME: delist won't be on the container, but rather on the project
// ContainerSchema.methods.checkDelistAction = function (user, cb) {
//   // callback immediately!
//   cb(null, this);
//   // send email if the user (who triggered this) is a mod, and log errors
//   if (user.isModerator) {
//     this.sendEmailIfDelisted(error.log);
//   }
// };
// ContainerSchema.methods.sendEmailIfDelisted = function (cb) {
//   var container = this;
//   async.waterfall([
//     Image.findById.bind(Image, container.parent, { name: 1, tags: 1, owner: 1 }),
//     sendEmailIfDelisted
//   ], cb);
//   function sendEmailIfDelisted (image, cb) {
//     var allTagsWereRemoved = container.tags.length === 0 && image.tags.length > 0;
//     if (allTagsWereRemoved) {
//       emailer.sendDelistEmail(image.owner, image, cb);
//     }
//     else {
//       cb();
//     }
//   }
// };

// FIXME: metapublish will be on Project
// ContainerSchema.methods.metaPublishCheck = function (image) {
//   // if the container and the parent image have the same last_write date, then we
//   // can assume that there is no need to re-publish the container and just update
//   // the meta-data (tags, name, description) of the parent image
//   if (!this.last_write || !image.last_write) {
//     return false;
//   }
//   if (this.status !== 'Draft' && this.commit_error === '') {
//     return false;
//   }
//   return this.last_write - image.last_write === 0;
// };
// ContainerSchema.methods.metaPublish = function (parent /* image */, cb) {
//   // sanity
//   var container = this;
//   if (container.last_write - parent.last_write !== 0) {
//     return cb(new Error('Should not have gotten here publishing with different last_write tags.'));
//   }
//   var attributes = [
//     'name',
//     'description',
//     'tags'
//   ];
//   parent.set(_.pick(container, attributes));
// 
//   // Container mojo
//   this.set({
//     'status': 'Finished',
//     'child': parent._id.toString()
//   });
//   var self = this;
//   async.parallel([
//     parent.save.bind(parent),
//     self.save.bind(self)
//   ], function (err, results) {
//     cb(err, self);
//   });
// };

// FIXME: this will need re-work
// ContainerSchema.methods.inheritFromImage = function (image, overrides, cb) {
//   if (typeof overrides === 'function') {
//     cb = overrides;
//     overrides = {};
//   }
//   var attributes = [
//     'name',
//     'description',
//     'tags',
//     'files',
//     'image',
//     'dockerfile',
//     // 'file_root',
//     // 'file_root_host',
//     'cmd',
//     // 'build_cmd',
//     // 'start_cmd',
//     // 'service_cmds',
//     'port',
//     // 'output_format',
//     'specification',
//     // 'last_write'
//   ];
//   if (image.toJSON) {
//     image = image.toJSON();
//   }
//   this.set(_.pick(image, attributes));
//   this.set({
//     parent: image._id,
//     servicesToken: 'services-' + uuid.v4(),
//     webToken: 'web-' + uuid.v4(),
//   });
//   if (!_.isEmpty(overrides)) {
//     this.set(overrides);
//   }
//   // FIXME: use getEnv
//   // this.env = [
//   //   'RUNNABLE_USER_DIR=' + image.file_root,
//   //   'RUNNABLE_SERVICE_CMDS=' + image.service_cmds,
//   //   'RUNNABLE_START_CMD=' + image.start_cmd,
//   //   'RUNNABLE_BUILD_CMD=' + image.build_cmd,
//   //   'SERVICES_TOKEN=' + this.servicesToken,
//   //   'APACHE_RUN_USER=www-data',
//   //   'APACHE_RUN_GROUP=www-data',
//   //   'APACHE_LOG_DIR=/var/log/apache2',
//   //   'PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
//   // ];
//   if (cb) {
//     cb(null, this);
//   }
// };

// FIXME: not doing files any longer
// var containerFilesMethods = require('./containerFilesMethods');
// _.extend(ContainerSchema.methods, containerFilesMethods);

var Container = module.exports = mongoose.model('Containers', ContainerSchema);
