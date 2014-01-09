var ObjectId, Schema, async, configs, decodeId, error, implementationSchema, minus, mongoose, request, underscore, updateEnv, users, uuid, _;
async = require('async');
configs = require('../configs');
error = require('../error');
mongoose = require('mongoose');
_ = require('lodash');
users = require('./users');
uuid = require('node-uuid');
request = require('request');
Schema = mongoose.Schema;
ObjectId = Schema.ObjectId;
implementationSchema = new Schema({
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
implementationSchema.statics.createImplementation = function (domain, opts, cb) {
  var _this = this;
  if (!opts.implements) {
    return cb(error(400, 'needs specification'));
  } else {
    return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
      if (!user) {
        return cb(error(404, 'user not found'));
      } else {
        return _this.findOne({
          owner: opts.userId,
          'implements': opts.implements
        }, domain.intercept(function (implementation) {
          var save;
          save = function () {
            return implementation.save(domain.intercept(function () {
              return cb(null, implementation.toJSON());
            }));
          };
          if (implementation) {
            return cb(error(403, 'implementation already exists'));
          } else {
            implementation = new _this();
            implementation.owner = opts.userId;
            implementation.implements = opts.implements;
            implementation.subdomain = opts.subdomain;
            implementation.requirements = opts.requirements;
            if (opts.containerId) {
              return updateEnv(domain, opts, save);
            } else {
              return save(null);
            }
          }
        }));
      }
    }));
  }
};
implementationSchema.statics.listImplementations = function (domain, userId, cb) {
  var _this = this;
  return users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      if (user.isModerator) {
        return _this.find({}, domain.intercept(function (implementations) {
          return cb(null, implementations.map(function (implementation) {
            return implementation.toJSON();
          }));
        }));
      } else {
        return cb(error(403, 'access denied'));
      }
    }
  }));
};
implementationSchema.statics.listImplementationsForUser = function (domain, userId, cb) {
  var _this = this;
  return users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      return _this.find({ owner: userId }, domain.intercept(function (implementations) {
        return cb(null, implementations.map(function (implementation) {
          return implementation.toJSON();
        }));
      }));
    }
  }));
};
implementationSchema.statics.getImplementationBySpecification = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      return _this.findOne({
        owner: opts.userId,
        'implements': opts.implements
      }, domain.intercept(function (implementation) {
        return cb(null, implementation.toJSON());
      }));
    }
  }));
};
implementationSchema.statics.getImplementation = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      if (user.isModerator) {
        return _this.findOne({ _id: opts.implementationId }, domain.intercept(function (implementation) {
          if (implementation == null) {
            return cb(error(404, 'implementation not found'));
          } else {
            return cb(null, implementation.toJSON());
          }
        }));
      } else {
        return _this.findOne({
          owner: opts.userId,
          _id: opts.implementationId
        }, domain.intercept(function (implementation) {
          if (implementation == null) {
            return cb(error(404, 'implementation not found'));
          } else {
            return cb(null, implementation.toJSON());
          }
        }));
      }
    }
  }));
};
implementationSchema.statics.updateImplementation = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    var query;
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      query = { _id: opts.implementationId };
      if (!user.isModerator) {
        query.owner = opts.userId;
      }
      return _this.findOne(query, domain.intercept(function (implementation) {
        var save;
        save = function () {
          return implementation.save(domain.intercept(function () {
            return cb(null, implementation.toJSON());
          }));
        };
        if (implementation == null) {
          return cb(error(404, 'implementation not found'));
        } else {
          implementation.requirements = opts.requirements;
          if (opts.containerId) {
            return updateEnv(domain, opts, save);
          } else {
            return save(null);
          }
        }
      }));
    }
  }));
};
implementationSchema.statics.deleteImplementation = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      if (user.isModerator) {
        return _this.remove({ _id: opts.implementationId }, domain.intercept(function (count) {
          if (count === 0) {
            return cb(error(404, 'implementation not found'));
          } else {
            return cb(null);
          }
        }));
      } else {
        return _this.remove({
          owner: opts.userId,
          _id: opts.implementationId
        }, domain.intercept(function (count) {
          if (count === 0) {
            return cb(error(404, 'implementation not found'));
          } else {
            return cb(null);
          }
        }));
      }
    }
  }));
};
implementationSchema.statics.updateEnvBySpecification = function (domain, opts, cb) {
  return this.findOne({
    owner: opts.userId,
    'implements': opts.specification
  }, function (err, implementation) {
    if (err || !implementation) {
      return cb(err || error(400, 'no implementation'));
    } else {
      return updateEnv(domain, {
        userId: opts.userId,
        'implements': opts.specification,
        containerId: opts.containerId,
        requirements: implementation.requirements,
        subdomain: implementation.subdomain
      }, cb);
    }
  });
};
updateEnv = function (domain, opts, cb) {
  var containers;
  containers = require('./containers');
  return containers.findOne({
    owner: opts.userId,
    _id: decodeId(opts.containerId)
  }, domain.intercept(function (container) {
    if (container) {
      return async.parallel([
        function (cb) {
          var requirements, url;
          url = 'http://' + container.servicesToken + '.' + configs.rootDomain + '/api/envs';
          requirements = {};
          opts.requirements.forEach(function (requirement) {
            requirements[requirement.name] = requirement.value;
          });
          return request.post({
            pool: false,
            url: url,
            json: requirements
          }, cb);
        },
        function (cb) {
          var url;
          url = '' + configs.harbourmaster + '/containers/' + container.servicesToken + '/route';
          return request({
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
minus = /-/g;
underscore = /_/g;
decodeId = function (id) {
  return new Buffer(id.toString().replace(minus, '+').replace(underscore, '/'), 'base64').toString('hex');
};