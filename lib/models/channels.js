var async = require('async');
var Category = require('models/categories');
var BaseSchema = require('./BaseSchema');
var mongoose = require('mongoose');
var _ = require('lodash');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var error = require('error');
var utils = require('middleware/utils');
var ChannelSchema = new Schema({
  name: {
    type: String,
    index: true,
    unique: true
  },
  description: { type: String },
  base: { type: ObjectId },
  aliases: {
    type: [String],
    index: true,
    unique: true,
    'default': []
  },
  tags: {
    type: [{ category: ObjectId }],
    'default': []
  }
});
// ChannelSchema.set('autoIndex', false);

// add aliases on when setting a channel name
ChannelSchema.path('name').set(function (name) {
  if (!name) {
    return name;
  }
  this.aliases.push(name.toString().toLowerCase());
  return name;
});

_.extend(ChannelSchema.methods, BaseSchema.methods);
_.extend(ChannelSchema.statics, BaseSchema.statics);

ChannelSchema.methods.returnJSON = function (cb) {
  var json = this.toJSON();
  var domain = require('domain').create();
  domain.on('error', cb);
  async.parallel({
    tags: this.getTags.bind(this),
    count: this.getImageCount.bind(this)
  },
  domain.intercept(function (results) {
    _.extend(json, results);
    cb(null, json);
  }));
};

ChannelSchema.methods.getTags = function (cb) {
  if (!this.tags) {
    return cb();
  }
  var categoryIds = this.tags.map(function (tag) {
    return tag.category;
  });
  var self = this;
  Category.find({ _id: { $in: categoryIds } }).lean().exec(function (err, categories) {
    var tags = self.tags.map(function (tag) {
      var category = _.findWhere(categories, function (category) {
        return utils.equalObjectIds(tag.category, category._id);
      });
      return _.extend(category, tag.toJSON());
    });
    cb(null, tags);
  });
};

ChannelSchema.methods.getImageCount = function (cb) {
  var Image = require('models/images');
  Image.count({ 'tags.channel': this._id }, cb);
};

ChannelSchema.methods.addAlias = function (alias, cb) {
  alias = alias.toLowerCase();
  var id = this._id;
  var query = {
    _id: id,
    aliases: { $ne: alias }
  };
  var update = {
    aliases: { $push: alias }
  };
  var self = this;
  Channel.findOneAndUpdate(query, update).lean().exec(function (err, updatedChannel) {
    if (err) {
      return cb(err);
    }
    if (updatedChannel) { // if channel updated
      self.set(updatedChannel);
    }
    cb();
  });
};

ChannelSchema.methods.tagWithCategory = function (category, cb) {
  var categoryId = category._id || category;
  this.tags.push({ category: categoryId });
  var tag = _.last(this.tags).toJSON();
  var query = {
    _id: this._id,
    'tags.category' : { $ne: categoryId }
  };
  var update = {
    $push: {
      tags: tag
    }
  };
  var self = this;
  Channel.findOneAndUpdate(query, update, function (err, updatedChannel) {
    if (err) {
      return cb(err);
    }
    if (!updatedChannel) {
      return cb(error(400, 'container already tagged with '+tag.name));
    }
    cb(null, updatedChannel);
  });
};

ChannelSchema.statics.findByName = function (name) {
  var args = Array.prototype.slice.call(arguments, 1); // slice off name arg
  var query = { aliases: name.toString().toLowerCase() };
  args.unshift(query);
  this.findOne.apply(this, args);
};

ChannelSchema.statics.findInCategory = function (category) {
  var args = Array.prototype.slice.call(arguments, 1); // slice off name arg
  var query = { 'tags.category': category._id };
  args.unshift(query);
  this.find.apply(this, args);
};

ChannelSchema.statics.findRelatedTo = function (channel, callback) {
  var Image = require('models/images');
  async.waterfall([
    Image.distinct.bind(Image, 'tags.channel', { 'tags.channel': channel._id }),
    function (channelIds, cb) {
      channelIds = channelIds.filter(function (channelId) {
        return !utils.equalObjectIds(channelId, channel._id); // filter our self
      });
      Channel.find({ _id: { $in: channelIds } }, cb);
    }
  ], callback);
};

ChannelSchema.statics.findChannelBadges = function (channelIds, userId, callback) {
  var Image = require('models/images');
  var self = this;
  var numLeaders = 2;
  async.reduce(channelIds, [], function (badges, channelId, cb) {
    async.waterfall([
      async.parallel.bind(async, {
        userChannelImageCount: Image.countInChannelByOwner.bind(Image, channelId, userId),
        channelImageCount: Image.count.bind(Image, { 'tags.channel': channelId }),
        ownerIds: Image.distinct.bind(Image, 'owner', { 'tags.channel': channelId }),
      }),
      userLeader,
      userBadge
    ], function (err, badge) {
      if (err) {
        return callback(err);
      }
      if (badge) {
        badges.push(badge);
      }
      cb(null, badges);
    });
    function userLeader (results, cb) {
      var userChannelImageCount = results.userChannelImageCount;
      if (userChannelImageCount === 0) {
        cb(null, null); // no badge
      }
      else if (userChannelImageCount >= results.channelImageCount/2) {
        cb(null, {
          userId: userId,
          leaderPosition: 1
        });
      }
      else {
        var otherChannelImageOwners = results.ownerIds.filter(function (ownerId) {
          return !utils.equalObjectIds(ownerId, userId);
        });
        var limit = otherChannelImageOwners.length/3;
        var usersLeadingUser = [];
        async.eachLimit(otherChannelImageOwners, limit, function (otherUserId, cb) {
          Image.countInChannelByOwner(channelId, otherUserId, function (err, imageCount) {
            if (err) {
              return cb(err);
            }
            if (imageCount > userChannelImageCount) {
              usersLeadingUser.push(otherUserId);
              if (usersLeadingUser.length >= numLeaders) {
                return cb(new Error('UserIsNotLeader')); // special error used break eachSeries
              }
            }
            cb();
          });
        },
        function (err) {
          if (err) {
            if (err.message === 'UserIsNotLeader') {
              return cb(null, null); // no badge
            }
            return cb(err);
          }
          cb(null, {
            userId: userId,
            leaderPosition: 1 + usersLeadingUser.length
          });
        });
      }
    }
    function userBadge (userLeader, cb) {
      if (!userLeader) {
        return cb(null, null);
      }
      async.waterfall([
        self.findById.bind(self, channelId),
        function (channel, cb) {
          channel.returnJSON(cb);
        },
        function (json, cb) {
          cb(null, _.extend(json, userLeader));
        }
      ], cb);
    }
  }, callback);
};

var Channel = module.exports = mongoose.model('Channels', ChannelSchema);
