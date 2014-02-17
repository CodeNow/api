var _ = require('lodash');
var async = require('async');
var configs = require('configs');
var error = require('error');
var mongoose = require('mongoose');
var BaseSchema = require('./BaseSchema');
var users = require('models/users');
var request = require('request');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var ImplementationSchema = new Schema({
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
// ImplementationSchema.set('autoIndex', false);

_.extend(ImplementationSchema.methods, BaseSchema.methods);
_.extend(ImplementationSchema.statics, BaseSchema.statics);

ImplementationSchema.statics.findOneForSpecByOwner = function (specId, ownerId) {
  var args = Array.prototype.slice.call(arguments, 2);
  var query = {
    implements: specId,
    owner: ownerId
  };
  args.unshift(query);
  this.findOne.apply(this, args);
};
// TODO break this legacy logic down.
ImplementationSchema.statics.updateEnvBySpecification =
  function (userId, containerId, specificationId, cb) {
    this.findOne({
      owner: userId,
      'implements': specificationId
    }, function (err, implementation) {
      if (err) {
        cb(err);
      } else if (!implementation) {
        cb(error(400, 'no implementation'));
      } else {
        updateEnv({
          userId: userId,
          'implements': specificationId,
          containerId: containerId,
          requirements: implementation.requirements,
          subdomain: implementation.subdomain
        }, cb);
      }
    });
  };
var updateEnv = function (opts, cb) {
  var containers;
  containers = require('./containers');
  containers.findOne({
    owner: opts.userId,
    _id: opts.containerId
  }, function (err, container) {
    if (err) {
      cb(err);
    } else if (container) {
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
          }, function (err, res, body) {
            cb(err, res);
          });
        },
        function (cb) {
          var url;
          url = '' + configs.harbourmaster + '/containers/' + container.servicesToken + '/route';
          request({
            pool: false,
            method: 'PUT',
            json: { webToken: opts.subdomain },
            url: url
          }, function (err, res, body) {
            cb(err, res);
          });
        }
      ], function (err, results) {
        if (err) {
          cb(err);
        } else if (results[0].statusCode !== 204) {
          cb(new Error('error updating envs'));
        } else if (results[1].statusCode !== 204) {
          cb(new Error('error updating token route'));
        } else {
          cb();
        }
      });
    } else {
      return cb(error(404, 'container not found'));
    }
  });
};






// OLD
ImplementationSchema.statics.createImplementation = function (domain, opts, cb) {
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
ImplementationSchema.statics.listImplementations = function (domain, userId, cb) {
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
ImplementationSchema.statics.listImplementationsForUser = function (domain, userId, cb) {
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
ImplementationSchema.statics.getImplementationBySpecification = function (domain, opts, cb) {
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
ImplementationSchema.statics.getImplementation = function (domain, opts, cb) {
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
ImplementationSchema.statics.updateImplementation = function (domain, opts, cb) {
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
ImplementationSchema.statics.deleteImplementation = function (domain, opts, cb) {
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
module.exports = mongoose.model('Implementation', ImplementationSchema);
var minus = /-/g;
var underscore = /_/g;
var decodeId = function (id) {
  return new Buffer(id.toString()
    .replace(minus, '+')
    .replace(underscore, '/'), 'base64')
    .toString('hex');
};