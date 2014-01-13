var async = require('async');
var configs = require('../configs');
var error = require('../error');
var images = require('./images');
var users = require('./users');
var mongoose = require('mongoose');
var redis = require('redis');
var _ = require('lodash');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var channelSchema = new Schema({
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
channelSchema.set('autoIndex', false);
var redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress);
channelSchema.statics.getChannel = function (domain, categories, id, cb) {
  this.findOne({ _id: id }, domain.intercept(function (channel) {
    var json;
    if (!channel) {
      cb(error(404, 'channel not found'));
    } else {
      json = channel.toJSON();
      json.tags = json.tags || [];
      images.find({ 'tags.channel': channel._id }).count().exec(domain.intercept(function (count) {
        json.count = count;
        async.forEach(json.tags, function (tag, cb) {
          categories.findOne({ _id: tag.category }, domain.intercept(function (category) {
            if (category) {
              tag.name = category.name;
            }
            cb();
          }));
        }, function (err) {
          if (err) {
            cb(err);
          } else {
            cb(null, json);
          }
        });
      }));
    }
  }));
};
channelSchema.statics.getChannelByName = function (domain, categories, name, cb) {
  var lower;
  lower = name.toLowerCase();
  this.findOne({ aliases: lower }, domain.intercept(function (channel) {
    if (!channel) {
      cb(error(404, 'channel not found'));
    } else {
      images.find({ 'tags.channel': channel._id }).count().exec(domain.intercept(function (count) {
        var json;
        json = channel.toJSON();
        json.count = count;
        async.forEach(json.tags, function (tag, cb) {
          categories.findOne({ _id: tag.category }, domain.intercept(function (category) {
            if (category) {
              tag.name = category.name;
            }
            cb();
          }));
        }, function (err) {
          cb(err, json);
        });
      }));
    }
  }));
};
channelSchema.statics.getChannelsWithNames = function (domain, categories, names, cb) {
  if (!Array.isArray(names)) {
    names = [names];
  }
  var lowers = names.map(function (name) {
    name.toLowerCase();
  });
  this.find({ aliases: { $in: lowers } }, domain.intercept(function (channels) {
    async.map(channels, function (channel, cb) {
      images.find({ 'tags.channel': channel._id }).count().exec(domain.intercept(function (count) {
        var json = channel.toJSON();
        json.count = count;
        async.forEach(json.tags, function (tag, cb) {
          categories.findOne({ _id: tag.category }, domain.intercept(function (category) {
            if (category) {
              tag.name = category.name;
            }
            cb();
          }));
        }, function (err) {
          cb(err, json);
        });
      }));
    }, cb);
  }));
};
channelSchema.statics.createChannel = function (domain, userId, name, desc, cb) {
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
          cb(error(403, 'a channel by that name already exists'));
        } else {
          var channel = new _this();
          channel.name = name;
          if (desc) {
            channel.description = desc;
          }
          channel.aliases = [name.toLowerCase()];
          if (name !== name.toLowerCase()) {
            channel.aliases.push(name);
          }
          channel.save(domain.intercept(function () {
            var json = channel.toJSON();
            json.count = 0;
            cb(null, json);
          }));
        }
      }));
    }
  });
};
channelSchema.statics.createImplicitChannel = function (domain, name, cb) {
  var channel = new this();
  channel.name = name;
  channel.aliases = [name.toLowerCase()];
  if (name !== name.toLowerCase()) {
    channel.aliases.push(name);
  }
  channel.save(domain.intercept(function () {
    cb(null, channel.toJSON());
  }));
};
channelSchema.statics.listChannels = function (domain, categories, cb) {
  var _this = this;
  redis_client.get('listChannelsCache', domain.intercept(function (listChannelsCache) {
    redis_client.get('listChannelsCacheValid', domain.intercept(function (valid) {
      if (valid && listChannelsCache) {
        cb(null, JSON.parse(listChannelsCache));
      } else {
        redis_client.setex('listChannelsCacheValid', 5, true);
        _this.find({}, domain.intercept(function (channels) {
          async.map(channels, function (channel, cb) {
            images.find({ 'tags.channel': channel._id }).count().exec(domain.intercept(function (count) {
              var json = channel.toJSON();
              json.count = count;
              json.tags = json.tags || [];
              async.forEach(json.tags, function (tag, cb) {
                categories.findOne({ _id: tag.category }, domain.intercept(function (category) {
                  if (category) {
                    tag.name = category.name;
                  }
                  cb();
                }));
              }, function (err) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, json);
                }
              });
            }));
          }, function (err, result) {
            if (err) {
              cb(err);
            } else {
              redis_client.set('listChannelsCache', JSON.stringify(result));
              cb(null, result);
            }
          });
        }));
      }
    }));
  }));
};
channelSchema.statics.extendWithNameAndCount = function (domain) {
  var self = this;
  return function (channelData, cb) {
    var channelId = channelData._id;
    self.findOne({ _id: channelData._id }, {
      name: 1,
      aliases: 1
    }).lean().exec(domain.intercept(function (channel) {
      _.extend(channel, channelData);
      images.find({ 'tags.channel': channelId }).count().exec(domain.intercept(function (count) {
        channel.count = count;
        cb(null, channel);
      }));
    }));
  };
};
channelSchema.statics.mostPopAffectedByUser = function (domain, size, userId, callback) {
  var self = this;
  images.distinct('tags.channel', { owner: userId }, domain.intercept(function (channelIds) {
    highestImageCount(domain, size, channelIds, domain.intercept(function (popularChannelsData) {
      async.map(popularChannelsData, function (channelData, cb) {
        self.extendWithNameAndCount(domain).call(self, channelData, domain.intercept(function (channel) {
          images.countInChannelByOwner(domain, channel._id, userId, function (err, userImagesCount) {
            if (err) {
              cb(err);
            } else {
              channel.userImagesCount = userImagesCount;
              channel.ratio = channel.userImagesCount / channel.count;
              cb(null, channel);
            }
          });
        }));
      }, domain.intercept(function (channels) {
        channels = channels.sort(sortBy('ratio'));
        callback(null, channels);
      }));
    }));
  }));
};
channelSchema.statics.isLeader = function (domain, userId, channelId, cb) {
  images.distinct('owner', { 'tags.channel': channelId }, domain.intercept(function (ownerIds) {
    async.reduce(ownerIds, [], function (leaders, ownerId, cb) {
      images.countInChannelByOwner(domain, channelId, ownerId, highestCountItems(3, leaders, { _id: ownerId }, cb));
    }, function (err, leaders) {
      var data;
      if (err) {
        cb(err);
      } else {
        data = null;
        leaders.some(function (leader, i) {
          if (leader._id.toString() === userId.toString()) {
            data = {
              _id: channelId,
              leaderPosition: i + 1,
              leaderImagesCount: leader.count
            };
            return true;
          }
        });
        cb(null, data);
      }
    });
  }));
};
channelSchema.statics.leaderBadgesInChannelsForUser = function (domain, size, filterChannelIds, userId, callback) {
  var self = this;
  async.reduce(filterChannelIds, [], function (badges, channelId, cb) {
    self.isLeader(domain, userId, channelId, function (err, leaderData) {
      if (err) {
        cb(err);
      } else {
        if (leaderData) {
          self.findOne({ _id: channelId }, {
            name: 1,
            aliases: 1
          }).lean().exec(domain.intercept(function (channel) {
            _.extend(channel, leaderData);
            images.count({ _id: channelId }, domain.intercept(function (count) {
              highestCountItems(size, badges, channel, cb)(null, count);
            }));
          }));
        } else {
          cb(null, badges);
        }
      }
    });
  }, domain.intercept(function (badges) {
    badges = badges.sort(sortBy('-leaderPosition'));
    callback(null, badges);
  }));
};
channelSchema.statics.listChannelsInCategory = function (domain, categories, categoryName, cb) {
  var _this = this;
  return categories.findOne({ aliases: categoryName.toLowerCase() }, domain.intercept(function (category) {
    if (!category) {
      return cb(error(404, 'could not find category'));
    } else {
      return redis_client.get('listChannelsInCategory:' + category._id, domain.intercept(function (listChannelsInCategoryCache) {
        return redis_client.get('listChannelsInCategoryValid:' + category._id, domain.intercept(function (valid) {
          if (valid && listChannelsInCategoryCache) {
            return cb(null, JSON.parse(listChannelsInCategoryCache));
          } else {
            redis_client.setex('listChannelsInCategoryValid:' + category._id, 5, true);
            return _this.find({ 'tags.category': category._id }, domain.intercept(function (channels) {
              return async.map(channels, function (channel, cb) {
                return images.find({ 'tags.channel': channel._id }).count().exec(domain.intercept(function (count) {
                  var json;
                  json = channel.toJSON();
                  json.count = count;
                  json.tags = json.tags || [];
                  return async.forEach(json.tags, function (tag, cb) {
                    return categories.findOne({ _id: tag.category }, domain.intercept(function (category) {
                      if (category) {
                        tag.name = category.name;
                      }
                      return cb();
                    }));
                  }, function (err) {
                    if (err) {
                      return cb(err);
                    } else {
                      return cb(null, json);
                    }
                  });
                }));
              }, function (err, result) {
                if (err) {
                  return cb(err);
                } else {
                  redis_client.set('listChannelsInCategory:' + category._id, JSON.stringify(result));
                  return cb(null, result);
                }
              });
            }));
          }
        }));
      }));
    }
  }));
};
channelSchema.statics.relatedChannels = function (domain, channelNames, cb) {
  var lowerNames, _this = this;
  lowerNames = channelNames.map(function (name) {
    return name.toLowerCase();
  });
  return this.find({ aliases: { $in: lowerNames } }, domain.bind(function (err, channels) {
    var channelIds;
    if (err) {
      throw err;
    } else {
      channelIds = channels.map(function (channel) {
        return channel._id;
      });
      return images.relatedChannelIds(domain, channelIds, domain.intercept(function (relatedChannelIds) {
        relatedChannelIds = toStringDifference(relatedChannelIds, channelIds);
        return _this.find({ _id: { $in: relatedChannelIds } }, domain.intercept(function (channels) {
          return async.map(channels, function (channel, cb) {
            return images.find({ 'tags.channel': channel._id }).count().exec(domain.intercept(function (count) {
              var json;
              json = channel.toJSON();
              json.count = count;
              return cb(null, json);
            }));
          }, cb);
        }));
      }));
    }
  }));
};
channelSchema.statics.updateChannel = function (domain, userId, channelId, newName, cb) {
  var _this = this;
  return users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      return cb(err);
    } else {
      if (!user.isModerator) {
        return cb(error(403, 'permission denied'));
      } else {
        if (newName == null) {
          return cb(error(400, 'name required'));
        } else {
          return _this.findOne({ _id: channelId }, domain.intercept(function (channel) {
            channel.name = newName;
            channel.aliases = [newName.toLowerCase()];
            if (newName !== newName.toLowerCase()) {
              channel.aliases.push(newName);
            }
            return channel.save(domain.intercept(function () {
              return cb(null, channel.toJSON());
            }));
          }));
        }
      }
    }
  });
};
channelSchema.statics.updateAliases = function (domain, userId, channelId, newAliases, cb) {
  var _this = this;
  return users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      return cb(err);
    } else {
      if (!user) {
        return cb(error(403, 'user not found'));
      } else {
        if (!user.isModerator) {
          return cb(error(403, 'permission denied'));
        } else {
          if (newAliases == null) {
            return cb(error(400, 'new aliases required'));
          } else {
            return _this.findOne({ _id: channelId }, domain.intercept(function (channel) {
              channel.aliases = newAliases;
              return channel.save(domain.intercept(function () {
                return cb(null, channel.toJSON());
              }));
            }));
          }
        }
      }
    }
  });
};
channelSchema.statics.deleteChannel = function (domain, userId, channelId, cb) {
  var _this = this;
  return users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      return cb(err);
    } else {
      if (!user.isModerator) {
        return cb(error(403, 'permission denied'));
      } else {
        return _this.remove({ _id: channelId }, domain.intercept(function () {
          return cb();
        }));
      }
    }
  });
};
channelSchema.statics.getTags = function (domain, categories, channelId, cb) {
  return this.findOne({ _id: channelId }, domain.intercept(function (channel) {
    if (!channel) {
      return cb(error(404, 'channel not found'));
    } else {
      return async.map(channel.tags, function (tag, cb) {
        var json;
        json = tag.toJSON();
        return categories.findOne({ _id: json.category }, domain.intercept(function (category) {
          if (category) {
            json.name = category.name;
          }
          return cb(null, json);
        }));
      }, cb);
    }
  }));
};
channelSchema.statics.getTag = function (domain, categories, channelId, tagId, cb) {
  return this.findOne({ _id: channelId }, domain.intercept(function (channel) {
    var json, tag;
    if (!channel) {
      return cb(error(404, 'channel not found'));
    } else {
      tag = channel.tags.id(tagId);
      if (!tag) {
        return cb(error(404, 'tag not found'));
      } else {
        json = tag.toJSON();
        return categories.findOne({ _id: json.category }, domain.intercept(function (category) {
          if (category) {
            json.name = category.name;
          }
          return cb(null, json);
        }));
      }
    }
  }));
};
channelSchema.statics.addTag = function (domain, categories, userId, channelId, text, cb) {
  var _this = this;
  return users.findUser(domain, { _id: userId }, function (err, user) {
    if (err) {
      return cb(err);
    } else {
      if (!user) {
        return cb(error(403, 'user not found'));
      } else {
        if (user.permission_level < 5) {
          return cb(error(403, 'permission denied'));
        } else {
          return _this.findOne({ _id: channelId }, domain.intercept(function (channel) {
            if (!channel) {
              return cb(error(404, 'channel not found'));
            } else {
              return categories.findOne({ aliases: text }, domain.intercept(function (category) {
                var tagId;
                if (category) {
                  channel.tags.push({ category: category._id });
                  tagId = channel.tags[channel.tags.length - 1]._id;
                  return channel.save(domain.intercept(function () {
                    return cb(null, {
                      name: category.name,
                      _id: tagId
                    });
                  }));
                } else {
                  return categories.createImplicitCategory(domain, text, function (err, category) {
                    if (err) {
                      return cb(err);
                    } else {
                      channel.tags.push({ category: category._id });
                      tagId = channel.tags[channel.tags.length - 1]._id;
                      return channel.save(domain.intercept(function () {
                        return cb(null, {
                          name: category.name,
                          _id: tagId
                        });
                      }));
                    }
                  });
                }
              }));
            }
          }));
        }
      }
    }
  });
};
channelSchema.statics.removeTag = function (domain, userId, channelId, tagId, cb) {
  return this.findOne({ _id: channelId }, domain.intercept(function (channel) {
    if (!channel) {
      return cb(error(404, 'channel not found'));
    } else {
      return users.findOne({ _id: userId }, domain.intercept(function (user) {
        if (!user) {
          return cb(error(403, 'user not found'));
        } else {
          if (user.permission_level < 5) {
            return cb(error(403, 'permission denied'));
          } else {
            channel.tags.id(tagId).remove();
            return channel.save(domain.intercept(function () {
              return cb();
            }));
          }
        }
      }));
    }
  }));
};
toStringDifference = function (arr1, arr2) {
  var filtered1, filtered2, strArr1, strArr2;
  strArr1 = arr1.map(function (i) {
    return i.toString();
  });
  strArr2 = arr2.map(function (i) {
    return i.toString();
  });
  filtered1 = arr1.filter(function (i) {
    return strArr2.indexOf(i.toString()) === -1;
  });
  filtered2 = arr2.filter(function (i) {
    return strArr1.indexOf(i.toString()) === -1;
  });
  return filtered1.concat(filtered2);
};
highestCountItems = function (size, memo, doc, cb) {
  return function (err, count) {
    var inserted;
    if (err) {
      return cb(err);
    } else {
      if (memo.length === 0) {
        doc.count = count;
        memo.push(doc);
      } else {
        inserted = memo.some(function (memoItem, i) {
          if (count > memoItem.count) {
            doc.count = count;
            memo.splice(i, 0, doc);
            if (memo.length > size) {
              memo.pop();
            }
            return true;
          }
        });
        if (!inserted && memo.length < size) {
          doc.count = count;
          memo.push(doc);
        }
      }
      return cb(null, memo);
    }
  };
};
highestImagesOwnedByCount = function (domain, size, channelIds, ownerId, callback) {
  return async.reduce(channelIds, [], function (popularChannelsData, channelId, cb) {
    return images.countInChannelByOwner(domain, channelId, ownerId, highestCountItems(size, popularChannelsData, channelId, cb));
  }, callback);
};
highestImageCount = function (domain, size, channelIds, callback) {
  return async.reduce(channelIds, [], function (popularChannelsData, channelId, cb) {
    return images.count({ 'tags.channel': channelId }, domain.intercept(function (count) {
      return highestCountItems(size, popularChannelsData, { _id: channelId }, cb)(null, count);
    }));
  }, callback);
};
sortBy = function (attr) {
  var inv;
  inv = 1;
  if (attr[0] === '-') {
    attr = attr.slice(1);
    inv = -1;
  }
  return function (a, b) {
    if (a[attr] > b[attr]) {
      return -1 * inv;
    } else {
      if (a[attr] < b[attr]) {
        return 1 * inv;
      } else {
        return 0;
      }
    }
  };
};
module.exports = mongoose.model('Channels', channelSchema);