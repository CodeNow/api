var ObjectId, Schema, async, configs, error, images, implementations, mongoose, specificationSchema, users, _;
async = require('async');
configs = require('../configs');
error = require('../error');
mongoose = require('mongoose');
_ = require('lodash');
users = require('./users');
images = require('./images');
implementations = require('./implementations');
Schema = mongoose.Schema;
ObjectId = Schema.ObjectId;
specificationSchema = new Schema({
  owner: { type: ObjectId },
  name: {
    type: String,
    index: true,
    unique: true
  },
  description: { type: String },
  instructions: { type: String },
  requirements: {
    type: [String],
    'default': []
  }
});
specificationSchema.set('autoIndex', false);
specificationSchema.statics.createSpecification = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      if (!user.isVerified) {
        return cb(error(403, 'user not verified'));
      } else {
        return _this.findOne({ name: opts.name }, domain.intercept(function (specification) {
          if (specification != null) {
            return cb(error(403, 'specification already exists'));
          } else {
            specification = new _this();
            specification.owner = opts.userId;
            specification.name = opts.name;
            specification.description = opts.description;
            specification.instructions = opts.instructions;
            specification.requirements = opts.requirements;
            return specification.save(domain.intercept(function () {
              return cb(null, specification.toJSON());
            }));
          }
        }));
      }
    }
  }));
};
specificationSchema.statics.listSpecifications = function (domain, cb) {
  var _this = this;
  return this.find({}, domain.intercept(function (specifications) {
    return async.map(specifications, function (spec, cb) {
      return _this.getVirtuals(domain, spec, cb);
    }, cb);
  }));
};
specificationSchema.statics.getSpecification = function (domain, id, cb) {
  var _this = this;
  return this.findOne({ _id: id }, domain.intercept(function (specification) {
    return _this.getVirtuals(domain, specification, cb);
  }));
};
specificationSchema.statics.updateSpecification = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    var query;
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      query = { _id: opts.specificationId };
      if (!user.isModerator) {
        query.owner = opts.userId;
      }
      return _this.findOne(query, domain.intercept(function (specification) {
        if (specification == null) {
          return cb(error(404, 'specification not found'));
        } else {
          specification.name = opts.name;
          specification.description = opts.description;
          specification.instructions = opts.instructions;
          specification.requirements = opts.requirements;
          return specification.save(domain.intercept(function () {
            return cb(null, specification.toJSON());
          }));
        }
      }));
    }
  }));
};
specificationSchema.statics.deleteSpecification = function (domain, opts, cb) {
  var _this = this;
  return users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      return cb(error(403, 'user not found'));
    } else {
      if (user.isModerator) {
        return _this.remove({ _id: opts.specificationId }, domain.intercept(function (count) {
          if (count === 0) {
            return cb(error(404, 'specification not found'));
          } else {
            return cb(null);
          }
        }));
      } else {
        return _this.remove({
          owner: opts.userId,
          _id: opts.specificationId
        }, domain.intercept(function (count) {
          if (count === 0) {
            return cb(error(404, 'specification not found'));
          } else {
            return cb(null);
          }
        }));
      }
    }
  }));
};
specificationSchema.statics.getVirtuals = function (domain, spec, cb) {
  var json, owner, specId;
  json = spec.toJSON();
  specId = json._id;
  owner = json.owner;
  console.log(specId, owner);
  return async.parallel([
    function (cb) {
      return images.findOne({ specification: specId }, { _id: 1 }, domain.intercept(function (image) {
        return cb(null, Boolean(image));
      }));
    },
    function (cb) {
      return images.findOne({
        specification: specId,
        owner: { $ne: owner }
      }, { _id: 1 }, domain.intercept(function (image) {
        return cb(null, Boolean(image));
      }));
    }
  ], domain.intercept(function (results) {
    json.inUse = results[0];
    json.inUseByNonOwner = results[1];
    return cb(null, json);
  }));
};
module.exports = mongoose.model('Specifications', specificationSchema);