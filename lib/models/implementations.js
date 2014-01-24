var async = require('async');
var configs = require('configs');
var error = require('error');
var mongoose = require('mongoose');
var users = require('models/users');
var request = require('request');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var implementationSchema = new Schema({
  owner: { type: ObjectId },
  'implements': { type: ObjectId },
  subdomain: {
    type: String,
    index: true,
    unique: true
  },
  requirements: {
    type: [{
      name: String,
      value: String
    }],
    'default': []
  }
});
implementationSchema.set('autoIndex', false);

implementationSchema.statics.findOneForSpecByOwner = function (specId, ownerId) {
  var args = Array.prototype.slice.call(arguments, 2);
  var query = {
    implements: specId,
    owner: ownerId
  };
  args.unshift(query);
  this.findOne.apply(this, args);
};







// OLD
implementationSchema.statics.createImplementation = function (domain, opts, cb) {
  var self = this;
  if (!opts.implements) {
    cb(error(400, 'needs specification'));
  } else {
    users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
      if (!user) {
        cb(error(404, 'user not found'));
      } else {
        self.findOne({
          owner: opts.userId,
          'implements': opts.implements
        }, domain.intercept(function (implementation) {
          var save = function () {
            implementation.save(domain.intercept(function () {
              cb(null, implementation.toJSON());
            }));
          };
          if (implementation) {
            cb(error(403, 'implementation already exists'));
          } else {
            implementation = new self();
            implementation.owner = opts.userId;
            implementation.implements = opts.implements;
            implementation.subdomain = opts.subdomain;
            implementation.requirements = opts.requirements;
            if (opts.containerId) {
              updateEnv(domain, opts, save);
            } else {
              save(null);
            }
          }
        }));
      }
    }));
  }
};
implementationSchema.statics.listImplementations = function (domain, userId, cb) {
  var self = this;
  users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else if (user.isModerator) {
      self.find({}, domain.intercept(function (implementations) {
        cb(null, implementations.map(function (implementation) {
          return implementation.toJSON();
        }));
      }));
    } else {
      return cb(error(403, 'access denied'));
    }
  }));
};
implementationSchema.statics.listImplementationsForUser = function (domain, userId, cb) {
  var self = this;
  users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else {
      self.find({ owner: userId }, domain.intercept(function (implementations) {
        cb(null, implementations.map(function (implementation) {
          return implementation.toJSON();
        }));
      }));
    }
  }));
};
implementationSchema.statics.getImplementationBySpecification = function (domain, opts, cb) {
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else {
      self.findOne({
        owner: opts.userId,
        'implements': opts.implements
      }, domain.intercept(function (implementation) {
        cb(null, implementation.toJSON());
      }));
    }
  }));
};
implementationSchema.statics.getImplementation = function (domain, opts, cb) {
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else if (user.isModerator) {
      self.findOne({ _id: opts.implementationId }, domain.intercept(function (implementation) {
        if (implementation == null) {
          cb(error(404, 'implementation not found'));
        } else {
          cb(null, implementation.toJSON());
        }
      }));
    } else {
      self.findOne({
        owner: opts.userId,
        _id: opts.implementationId
      }, domain.intercept(function (implementation) {
        if (implementation == null) {
          cb(error(404, 'implementation not found'));
        } else {
          cb(null, implementation.toJSON());
        }
      }));
    }
  }));
};
implementationSchema.statics.updateImplementation = function (domain, opts, cb) {
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else {
      var query = { _id: opts.implementationId };
      if (!user.isModerator) {
        query.owner = opts.userId;
      }
      self.findOne(query, domain.intercept(function (implementation) {
        var save = function () {
          implementation.save(domain.intercept(function () {
            cb(null, implementation.toJSON());
          }));
        };
        if (implementation == null) {
          cb(error(404, 'implementation not found'));
        } else {
          implementation.requirements = opts.requirements;
          if (opts.containerId) {
            updateEnv(domain, opts, save);
          } else {
            save(null);
          }
        }
      }));
    }
  }));
};
implementationSchema.statics.deleteImplementation = function (domain, opts, cb) {
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else if (user.isModerator) {
      self.remove({ _id: opts.implementationId }, domain.intercept(function (count) {
        if (count === 0) {
          cb(error(404, 'implementation not found'));
        } else {
          cb(null);
        }
      }));
    } else {
      self.remove({
        owner: opts.userId,
        _id: opts.implementationId
      }, domain.intercept(function (count) {
        if (count === 0) {
          cb(error(404, 'implementation not found'));
        } else {
          cb(null);
        }
      }));
    }
  }));
};
implementationSchema.statics.updateEnvBySpecification = function (domain, opts, cb) {
  this.findOne({
    owner: opts.userId,
    'implements': opts.specification
  }, function (err, implementation) {
    if (err || !implementation) {
      cb(err || error(400, 'no implementation'));
    } else {
      updateEnv(domain, {
        userId: opts.userId,
        'implements': opts.specification,
        containerId: opts.containerId,
        requirements: implementation.requirements,
        subdomain: implementation.subdomain
      }, cb);
    }
  });
};
var updateEnv = function (domain, opts, cb) {
  var containers;
  containers = require('./containers');
  containers.findOne({
    owner: opts.userId,
    _id: decodeId(opts.containerId)
  }, domain.intercept(function (container) {
    if (container) {
      async.parallel([
        function (cb) {
          var requirements, url;
          url = 'http://' + container.servicesToken + '.' + configs.rootDomain + '/api/envs';
          requirements = {};
          opts.requirements.forEach(function (requirement) {
            requirements[requirement.name] = requirement.value;
          });
          request.post({
            proxy: configs.dockworkerProxy,
            pool: false,
            url: url,
            json: requirements
          }, cb);
        },
        function (cb) {
          var url;
          url = '' + configs.harbourmaster + '/containers/' + container.servicesToken + '/route';
          request({
            pool: false,
            method: 'PUT',
            json: { webToken: opts.subdomain },
            url: url
          }, cb);
        }
      ], domain.intercept(function () {
        return cb();
      }));
    } else {
      return cb(error(404, 'container not found'));
    }
  }));
};
module.exports = mongoose.model('Implementation', implementationSchema);
var minus = /-/g;
var underscore = /_/g;
var decodeId = function (id) {
  return new Buffer(id.toString()
    .replace(minus, '+')
    .replace(underscore, '/'), 'base64')
    .toString('hex');
};