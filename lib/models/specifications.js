var async = require('async');
var error = require('../error');
var mongoose = require('mongoose');
var users = require('./users');
var images = require('./images');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var specificationSchema = new Schema({
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
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else {
      if (!user.isVerified) {
        cb(error(403, 'user not verified'));
      } else {
        self.findOne({ name: opts.name }, domain.intercept(function (specification) {
          if (specification != null) {
            cb(error(403, 'specification already exists'));
          } else {
            specification = new self();
            specification.owner = opts.userId;
            specification.name = opts.name;
            specification.description = opts.description;
            specification.instructions = opts.instructions;
            specification.requirements = opts.requirements;
            specification.save(domain.intercept(function () {
              cb(null, specification.toJSON());
            }));
          }
        }));
      }
    }
  }));
};
specificationSchema.statics.listSpecifications = function (domain, cb) {
  var self = this;
  this.find({}, domain.intercept(function (specifications) {
    async.map(specifications, function (spec, cb) {
      self.getVirtuals(domain, spec, cb);
    }, cb);
  }));
};
specificationSchema.statics.getSpecification = function (domain, id, cb) {
  var self = this;
  this.findOne({ _id: id }, domain.intercept(function (specification) {
    if (!specification) {
      return cb(error(404, 'specification not found'));
    }
    self.getVirtuals(domain, specification, cb);
  }));
};
specificationSchema.statics.updateSpecification = function (domain, opts, cb) {
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    var query;
    if (!user) {
      cb(error(403, 'user not found'));
    } else {
      query = { _id: opts.specificationId };
      if (!user.isModerator) {
        query.owner = opts.userId;
      }
      self.findOne(query, domain.intercept(function (specification) {
        if (specification == null) {
          cb(error(404, 'specification not found'));
        } else {
          specification.name = opts.name;
          specification.description = opts.description;
          specification.instructions = opts.instructions;
          specification.requirements = opts.requirements;
          specification.save(domain.intercept(function () {
            cb(null, specification.toJSON());
          }));
        }
      }));
    }
  }));
};
specificationSchema.statics.deleteSpecification = function (domain, opts, cb) {
  var self = this;
  users.findUser(domain, { _id: opts.userId }, domain.intercept(function (user) {
    if (!user) {
      cb(error(403, 'user not found'));
    } else if (user.isModerator) {
      self.remove({ _id: opts.specificationId }, domain.intercept(function (count) {
        if (count === 0) {
          cb(error(404, 'specification not found'));
        } else {
          cb(null);
        }
      }));
    } else {
      self.remove({
        owner: opts.userId,
        _id: opts.specificationId
      }, domain.intercept(function (count) {
        if (count === 0) {
          cb(error(404, 'specification not found'));
        } else {
          cb(null);
        }
      }));
    }
  }));
};
specificationSchema.statics.getVirtuals = function (domain, spec, cb) {
  var json = spec.toJSON();
  var specId = json._id;
  var owner = json.owner;
  async.parallel([
    function (cb) {
      images.findOne({ specification: specId }, { _id: 1 }, domain.intercept(function (image) {
        cb(null, Boolean(image));
      }));
    },
    function (cb) {
      images.findOne({
        specification: specId,
        owner: { $ne: owner }
      }, { _id: 1 }, domain.intercept(function (image) {
        cb(null, Boolean(image));
      }));
    }
  ], domain.intercept(function (results) {
    json.inUse = results[0];
    json.inUseByNonOwner = results[1];
    cb(null, json);
  }));
};
module.exports = mongoose.model('Specifications', specificationSchema);