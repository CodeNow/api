var __indexOf = [].indexOf;
var async = require('async');
var channels = require('./channels');
var configs = require('../configs');
var error = require('../error');
var images = require('./images');
var users = require('./users');
var mongoose = require('mongoose');
var _ = require('lodash');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var categorySchema = new Schema({
  name: {
    type: String,
    index: true,
    unique: true
  },
  description: { type: String },
  aliases: {
    type: [String],
    index: true,
    unique: true,
    'default': []
  }
});
categorySchema.set('autoIndex', false);
categorySchema.statics.getCategory = function (domain, categoryId, cb) {
  this.findOne({ _id: categoryId }, domain.intercept(function (category) {
    if (!category) {
      cb(error(404, 'not found'));
    } else {
      channels.find({ 'tags.category': category._id }).count().exec(domain.intercept(function (count) {
        var json = category.toJSON();
        json.count = count;
        cb(null, json);
      }));
    }
  }));
};
categorySchema.statics.getCategoryByName = function (domain, categoryName, cb) {
  this.findOne({ aliases: categoryName.toLowerCase() }, domain.intercept(function (category) {
    if (!category) {
      cb(error(404, 'not found'));
    } else {
      channels.find({ 'tags.category': category._id }).count().exec(domain.intercept(function (count) {
        var json = category.toJSON();
        json.count = count;
        cb(null, json);
      }));
    }
  }));
};
categorySchema.statics.listCategories = function (domain, cb) {
  this.find({}, domain.intercept(function (categories) {
    async.map(categories, function (category, cb) {
      channels.find({ 'tags.category': category._id }).count().exec(domain.intercept(function (count) {
        var json = category.toJSON();
        json.count = count;
        cb(null, json);
      }));
    }, cb);
  }));
};
categorySchema.statics.createCategory = function (domain, userId, name, desc, cb) {
  var _this = this;
  users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      cb(err);
    } else if (!user) {
      cb(error(403, 'user not found'));
    } else if (!user.isModerator) {
      cb(error(403, 'permission denied'));
    } else if (name == null) {
        cb(error(400, 'name required'));
    } else {
      _this.findOne({ aliases: name.toLowerCase() }, domain.intercept(function (existing) {
        if (existing) {
          cb(error(403, 'category by that name already exists'));
        } else {
          var category = new _this();
          category.name = name;
          if (desc) {
            category.description = desc;
          }
          category.aliases = [name.toLowerCase()];
          if (name !== name.toLowerCase()) {
            category.aliases.push(name);
          }
          category.save(domain.intercept(function () {
            cb(null, category.toJSON());
          }));
        }
      }));
    }
  });
};
categorySchema.statics.createImplicitCategory = function (domain, name, cb) {
  var category = new this();
  category.name = name;
  category.aliases = [name.toLowerCase()];
  if (name !== name.toLowerCase()) {
    category.aliases.push(name);
  }
  category.save(domain.intercept(function () {
    cb(null, category.toJSON());
  }));
};
categorySchema.statics.updateCategory = function (domain, userId, categoryId, newName, newDesc, cb) {
  var _this = this;
  users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      cb(err);
    } else if (!user) {
      cb(error(403, 'user not found'));
    } else if (!user.isModerator) {
      cb(error(403, 'permission denied'));
    } else if (newName == null || newDesc == null) {
      cb(error(400, 'name and desc field required'));
    } else {
      _this.findOne({ _id: categoryId }, domain.intercept(function (category) {
        var _ref;
        if (newDesc) {
          category.description = newDesc;
        }
        if (category.name !== newName) {
          category.name = newName;
          if (_ref = !newName, __indexOf.call(category.aliases, _ref) >= 0) {
            category.alias.push(newName);
          }
        }
        category.save(domain.intercept(function () {
          cb(null, category.toJSON());
        }));
      }));
    }
  });
};
categorySchema.statics.updateAliases = function (domain, userId, categoryId, newAliases, cb) {
  var _this = this;
  users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      cb(err);
    } else if (!user.isModerator) {
      cb(error(403, 'permission denied'));
    } else {
      if (newAliases == null) {
        cb(error(400, 'aliases required'));
      } else {
        _this.findOne({ _id: categoryId }, domain.intercept(function (channel) {
          channel.aliases = newAliases;
          channel.save(domain.intercept(function () {
            cb(null, channel.toJSON());
          }));
        }));
      }
    }
  });
};
categorySchema.statics.deleteCategory = function (domain, userId, categoryId, cb) {
  var _this = this;
  users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      cb(err);
    } else if (!user.isModerator) {
      cb(error(403, 'permission denied'));
    } else {
      _this.remove({ _id: categoryId }, domain.intercept(function () {
        cb();
      }));
    }
  });
};
module.exports = mongoose.model('Categories', categorySchema);