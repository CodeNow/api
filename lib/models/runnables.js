var __indexOf = [].indexOf;
var async = require('async');
var caching = require('./caching');
var channels = require('./channels');
var configs = require('../configs');
var containers = require('./containers');
var error = require('../error');
var images = require('./images');
var users = require('./users');
var harbourmaster = require('./harbourmaster');
var _ = require('lodash');
var listFields = {
  _id: 1,
  name: 1,
  tags: 1,
  owner: 1,
  created: 1,
  votes: 1,
  views: 1,
  copies: 1,
  runs: 1
};
var Runnables = {
  createImageFromDisk: function (domain, userId, runnablePath, sync, cb) {
    console.log(1);
    images.createFromDisk(domain, userId, runnablePath, sync, domain.intercept(function (image, tags) {
      console.log(2);
      async.forEach(tags, function (tag, cb) {
        console.log(3);
        channels.findOne({ aliases: tag.toLowerCase() }, domain.intercept(function (channel) {
          console.log(4);
          if (channel) {
            image.tags.push({ channel: channel._id });
            cb();
          } else {
            channels.createImplicitChannel(domain, tag, domain.intercept(function (channel) {
              image.tags.push({ channel: channel._id });
              cb();
            }));
          }
        }));
      }, domain.intercept(function () {
        image.save(domain.intercept(function () {
          users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
            if (!user) {
              cb(error(404, 'user not found'));
            } else {
              user.addVote(domain, image._id, domain.intercept(function () {
                var json_image = image.toJSON();
                delete json_image.files;
                if (json_image.parent) {
                  json_image.parent = encodeId(json_image.parent);
                }
                json_image._id = encodeId(image._id);
                cb(null, json_image);
                caching.markCacheAsDirty();
              }));
            }
          }));
        }));
      }));
    }));
  },
  createImage: function (domain, userId, from, sync, cb) {
    if (!isObjectId64(from)) {
      cb(error(404, 'source runnable not found'));
    } else {
      containers.findOne({ _id: decodeId(from) }, domain.intercept(function (container) {
        if (!container) {
          cb(error(403, 'source runnable not found'));
        } else if (container.owner.toString() !== userId) {
          cb(error(403, 'permission denied'));
        } else {
          images.createFromContainer(domain, container, domain.intercept(function (image) {
            container.target = image._id;
            container.save(domain.intercept(function () {
              users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
                if (!user) {
                  cb(error(404, 'user not found'));
                } else {
                  user.addVote(domain, image._id, domain.intercept(function () {
                    var json_image = image.toJSON();
                    delete json_image.files;
                    if (json_image.parent) {
                      json_image.parent = encodeId(json_image.parent);
                    }
                    json_image._id = encodeId(image._id);
                    cb(null, json_image);
                    caching.markCacheAsDirty();
                  }));
                }
              }));
            }));
          }));
        }
      }));
    }
  },
  createContainer: function (domain, userId, from, cb) {
    var data = {};
    async.waterfall([
      function (cb) {
        if (isObjectId64(from)) {
          images.findOne({ _id: decodeId(from) }, domain.intercept(function (image) {
            if (!image) {
              cb(error(400, 'could not find source image to fork from'));
            } else {
              cb(null, image);
            }
          }));
        } else {
          var options = {
            sort: { _id: 1 },
            limit: 1
          };
          channels.findOne({ aliases: from.toLowerCase() }, domain.intercept(function (channel) {
            if (!channel) {
              cb(error(400, 'could not find channel by that name'));
            } else {
              var useOldestProject = function () {
                images.find({ 'tags.channel': channel._id }, null, options, domain.intercept(function (images) {
                  if (!images.length) {
                    cb(error(400, 'could not find runnable to fork from'));
                  } else {
                    cb(null, images[0]);
                  }
                }));
              };
              users.findOne({ _id: userId }, { permission_level: 1 }, domain.intercept(function (user) {
                if (user.registered) {
                  data.saved = true;
                }
                if (!channel.base) {
                  useOldestProject();
                } else {
                  images.findById(channel.base, domain.intercept(function (image) {
                    if (!image) {
                      useOldestProject();
                    } else {
                      cb(null, image);
                    }
                  }));
                }
              }));
            }
          }));
        }
      },
      function (image, cb) {
        containers.create(domain, userId, image, data, domain.intercept(function (container) {
          var json_container = container.toJSON();
          encode(domain, json_container, cb);
        }));
      }
    ], cb);
  },
  listContainers: function (domain, userId, query, cb) {
    query = query || {};
    query.owner = userId;
    containers.find(query, domain.intercept(function (containers) {
      async.map(containers, function (item, cb) {
        var json = item.toJSON();
        encode(domain, json, cb);
      }, cb);
    }));
  },
  migrateContainers: function (domain, userId, targetUserId, cb) {
    containers.update({ owner: userId }, { $set: { owner: targetUserId } }, domain.intercept(function () {
      cb();
    }));
  },
  getContainer: function (domain, userId, runnableId, cb) {
    runnableId = decodeId(runnableId);
    if (!isObjectId(runnableId)) {
      cb(error, 404, 'runnable not found');
    } else {
      async.parallel({
        user: users.findById.bind(users, userId),
        container: containers.findById.bind(containers, runnableId)
      },
      domain.intercept(function (results) {
        var user = results.user;
        var container = results.container;
        if (!container) {
          cb(error(404, 'runnable not found'));
        }
        else if (container.owner.toString() !== userId && !user.isModerator) {
          cb(error(403, 'permission denied'));
        }
        else {
          encode(domain, container.toJSON(), cb);
        }
      }));
    }
  },
  removeContainer: function (domain, userId, runnableId, cb) {
    runnableId = decodeId(runnableId);
    var remove = function () {
      containers.destroy(domain, runnableId, cb);
    };
    containers.findOne({ _id: runnableId }, domain.intercept(function (container) {
      if (!container) {
        cb(error(404, 'runnable not found'));
      } else {
        if (container.owner.toString() === userId.toString()) {
          remove();
        } else {
          users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
            if (!user) {
              cb(error(404, 'user not found'));
            } else if (user.permission_level <= 1) {
              cb(error(403, 'permission denied'));
            } else {
              remove();
            }
          }));
        }
      }
    }));
  },
  removeImage: function (domain, userId, runnableId, cb) {
    runnableId = decodeId(runnableId);
    var remove = function () {
      images.destroy(domain, runnableId, cb);
    };
    images.findOne({ _id: runnableId }, domain.intercept(function (image) {
      if (!image) {
        cb(error(404, 'runnable not found'));
      } else if (image.owner.toString() === userId.toString()) {
        remove();
      } else {
        users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
          if (!user) {
            cb(error(404, 'user not found'));
          } else if (user.permission_level <= 1) {
            cb(error(403, 'permission denied'));
          } else {
            user.votes.forEach(function (vote) {
              if (vote.runnable.toString() === image._id.toString()) {
                vote.remove();
              }
            });
            remove();
          }
        }));
      }
    }));
  },
  updateContainer: function (domain, userId, runnableId, updateSet, token, cb) {
    runnableId = decodeId(runnableId);
    var commit = function (container, cb) {
      var json;
      json = encodeIdsIn(container.toJSON());
      harbourmaster.commitContainer(domain, json, token, cb);
    };
    containers.findOne({ _id: runnableId }, { files: 0 }, domain.intercept(function (container) {
      if (container == null) {
        cb(error(404, 'runnable not found'));
      } else {
        container.set(updateSet);
        async.series([
          function (cb) {
            if (updateSet.status === 'Committing new') {
              images.findOne({ name: updateSet.name || container.name }, domain.intercept(function (existing) {
                if (existing) {
                  cb(error(403, 'a shared runnable by that name already exists'));
                } else {
                  commit(container, cb);
                }
              }));
            } else if (updateSet.status === 'Committing back') {
              commit(container, cb);
            } else {
              cb();
            }
          },
          function (cb) {
            container.updateRunOptions(domain, cb);
          },
          function (cb) {
            container.save(domain.intercept(function () {
              cb();
            }));
          }
        ], domain.intercept(function () {
          encode(domain, container.toJSON(), cb);
        }));
      }
    }));
  },
  updateImage: function (domain, userId, runnableId, from, cb) {
    runnableId = decodeId(runnableId);
    from = decodeId(from);
    images.findOne({ _id: runnableId }, domain.intercept(function (image) {
      if (!image) {
        cb(error(404, 'published runnable does not exist'));
      } else {
        var update = function (su) {
          containers.findOne({ _id: from }, domain.intercept(function (container) {
            if (!container) {
              cb(error(403, 'source container to copy from does not exist'));
            } else {
              if (!su && container.owner.toString() !== image.owner.toString()) {
                cb(error(400, 'source container owner does not match image owner'));
              } else {
                image.updateFromContainer(domain, container, domain.intercept(function () {
                  encode(domain, image.toJSON(), cb);
                }));
              }
            }
          }));
        };
        if (image.owner.toString() === userId) {
          update(false);
        } else {
          users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
            if (!user) {
              cb(error(404, 'user not found'));
            } else if (user.permission_level < 5) {
              cb(error(403, 'permission denied'));
            } else {
              update(true);
            }
          }));
        }
      }
    }));
  },
  getImage: function (domain, runnableId, cb) {
    if (!isObjectId64(runnableId)) {
      cb(error(404, 'runnable not found'));
    } else {
      var decodedRunnableId = decodeId(runnableId);
      images.findOne({ _id: decodedRunnableId }, { files: 0 }, domain.intercept(function (image) {
        if (!image) {
          cb(error(404, 'runnable not found'));
        } else {
          var json_project = image.toJSON();
          encode(domain, json_project, cb);
        }
      }));
    }
  },
  getVotes: function (domain, runnableId, cb) {
    runnableId = decodeId(runnableId);
    users.find({ 'votes.runnable': runnableId }).count().exec(domain.intercept(function (count) {
      cb(null, { count: count - 1 });
    }));
  },
  vote: function (domain, userId, runnableId, cb) {
    runnableId = decodeId(runnableId);
    async.series([
      function (cb) {
        images.isOwner(domain, userId, runnableId, domain.intercept(function (isOwner) {
          if (isOwner) {
            cb(error(403, 'cannot vote for own runnables'));
          } else {
            cb();
          }
        }));
      },
      function (cb) {
        users.addVote(domain, userId, runnableId, cb);
      },
      function (cb) {
        images.incVote(domain, runnableId, cb);
      }
    ], domain.intercept(function (results) {
      var vote = results[1];
      cb(null, vote);
    }));
  },
  listAll: function (domain, sort, limit, page, cb) {
    var countQuery, query;
    query = images.find({}, listFields).sort(sort).skip(page * limit).limit(limit);
    countQuery = images.find({}, listFields).sort(sort).skip(page * limit).limit(limit).count();
    async.parallel({
      images: function (cb) {
        query.exec(domain.intercept(function (images) {
          arrayToJSON(domain, images, cb);
        }));
      },
      count: function (cb) {
        countQuery.exec(domain.intercept(function (count) {
          cb(null, count);
        }));
      }
    }, domain.intercept(function (results) {
      var lastPage = Math.ceil(results.count / limit) - 1;
      cb(null, results.images, { lastPage: lastPage });
    }));
  },
  listByPublished: function (domain, sort, limit, page, cb) {
    this.listFiltered(domain, { tags: { $not: { $size: 0 } } }, sort, limit, page, null, cb);
  },
  listByChannelMembership: function (domain, channelIds, sort, limit, page, cb) {
    this.listFiltered(domain, { 'tags.channel': { $in: channelIds } }, sort, limit, page, null, cb);
  },
  listByOwner: function (domain, owner, sort, limit, page, cb) {
    var fields = _.clone(listFields);
    _.extend(fields, {
      copies: 1,
      pastes: 1,
      cuts: 1,
      runs: 1,
      views: 1
    });
    this.listFiltered(domain, { owner: owner }, sort, limit, page, fields, cb);
  },
  listFiltered: function (domain, query, sort, limit, page, fields, cb) {
    fields = fields || listFields;
    var countQuery = images.find(query, fields).sort(sort).skip(page * limit).limit(limit).count();
    query = images.find(query, fields).sort(sort).skip(page * limit).limit(limit).lean();
    async.parallel({
      images: function (cb) {
        query.exec(domain.intercept(function (images) {
          arrayToJSON(domain, images, cb);
        }));
      },
      count: function (cb) {
        countQuery.exec(domain.intercept(function (count) {
          cb(null, count);
        }));
      }
    }, domain.intercept(function (results) {
      var lastPage = Math.ceil(results.count / limit) - 1;
      cb(null, results.images, { lastPage: lastPage });
    }));
  },
  listNames: function (domain, cb) {
    images.find({ tags: { $not: { $size: 0 } } }, {
      _id: 1,
      name: 1,
      tags: 1
    }).exec(domain.intercept(function (results) {
      arrayToJSON(domain, results, cb);
    }));
  },
  getTags: function (domain, runnableId, cb) {
    runnableId = decodeId(runnableId);
    images.findOne({ _id: runnableId }, domain.intercept(function (image) {
      if (!image) {
        cb(error(404, 'runnable not found'));
      } else {
        async.map(image.tags, function (tag, cb) {
          var json;
          json = tag.toJSON();
          channels.findOne({ _id: json.channel }, domain.intercept(function (channel) {
            if (channel) {
              json.name = channel.name;
            }
            cb(null, json);
          }));
        }, cb);
      }
    }));
  },
  getTag: function (domain, runnableId, tagId, cb) {
    runnableId = decodeId(runnableId);
    images.findOne({ _id: runnableId }, domain.intercept(function (image) {
      if (!image) {
        cb(error(404, 'runnable not found'));
      } else {
        var tag = image.tags.id(tagId);
        if (!tag) {
          cb(error(404, 'tag not found'));
        } else {
          var json = tag.toJSON();
          channels.findOne({ _id: json.channel }, domain.intercept(function (channel) {
            if (channel) {
              json.name = channel.name;
            }
            cb(null, json);
          }));
        }
      }
    }));
  },
  addTag: function (domain, userId, runnableId, text, cb) {
    users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
      if (!user) {
        cb(error(403, 'user not found'));
      } else if (user.permission_level < 1) {
        cb(error(403, 'permission denied'));
      } else {
        runnableId = decodeId(runnableId);
        images.findOne({ _id: runnableId }, domain.intercept(function (image) {
          if (!image) {
            cb(error(404, 'runnable not found'));
          } else {
            var add = function () {
              channels.findOne({ aliases: text.toLowerCase() }, domain.intercept(function (channel) {
                var createTag = function (channel, cb) {
                  image.tags.push({ channel: channel._id });
                  image.save(domain.intercept(function () {
                    var newTag = _.last(image.tags).toJSON();
                    newTag.name = channel.name;
                    cb(null, newTag);
                  }));
                };
                if (channel) {
                  createTag(channel, cb);
                } else {
                  channels.createImplicitChannel(domain, text, domain.intercept(function (channel) {
                    createTag(channel, cb);
                  }));
                }
              }));
            };
            if (image.owner.toString() === userId.toString()) {
              add();
            } else if (user.permission_level > 1) {
              add();
            } else {
              cb(error(403, 'permission denied'));
            }
          }
        }));
      }
    }));
  },
  removeTag: function (domain, userId, runnableId, tagId, cb) {
    runnableId = decodeId(runnableId);
    images.findOne({ _id: runnableId }, domain.intercept(function (image) {
      if (!image) {
        cb(error(404, 'runnable not found'));
      } else if (image.owner.toString() !== userId.toString()) {
        users.findOne({ _id: userId }, domain.intercept(function (user) {
          if (!user) {
            cb(error(403, 'user not found'));
          } else if (user.permission_level < 2) {
            cb(error(403, 'permission denied'));
          } else {
            image.tags.id(tagId).remove();
            image.save(domain.intercept(function () {
              cb();
            }));
          }
        }));
      } else {
        image.tags.id(tagId).remove();
        image.save(domain.intercept(function () {
          cb();
        }));
      }
    }));
  },
  getContainerTags: function (domain, runnableId, cb) {
    runnableId = decodeId(runnableId);
    containers.findOne({ _id: runnableId }, domain.intercept(function (container) {
      if (!container) {
        cb(error(404, 'runnable not found'));
      } else {
        async.map(container.tags, function (tag, cb) {
          var json;
          json = tag.toJSON();
          channels.findOne({ _id: json.channel }, domain.intercept(function (channel) {
            if (channel) {
              json.name = channel.name;
            }
            cb(null, json);
          }));
        }, cb);
      }
    }));
  },
  getContainerTag: function (domain, runnableId, tagId, cb) {
    runnableId = decodeId(runnableId);
    containers.findOne({ _id: runnableId }, domain.intercept(function (container) {
      if (!container) {
        cb(error(404, 'runnable not found'));
      } else {
        var tag = container.tags.id(tagId);
        if (!tag) {
          cb(error(404, 'tag not found'));
        } else {
          var json = tag.toJSON();
          channels.findOne({ _id: json.channel }, domain.intercept(function (channel) {
            if (channel) {
              json.name = channel.name;
            }
            cb(null, json);
          }));
        }
      }
    }));
  },
  addContainerTag: function (domain, userId, runnableId, text, cb) {
    users.findUser(domain, { _id: userId }, domain.intercept(function (user) {
      if (!user) {
        cb(error(403, 'user not found'));
      } else {
        runnableId = decodeId(runnableId);
        containers.findOne({ _id: runnableId }, domain.intercept(function (container) {
          if (!container) {
            cb(error(404, 'runnable not found'));
          } else {
            var add = function () {
              channels.findOne({ aliases: text.toLowerCase() }, domain.intercept(function (channel) {
                var createTag = function (channel, cb) {
                  container.tags.push({ channel: channel._id });
                  container.save(domain.intercept(function () {
                    var newTag = _.last(container.tags).toJSON();
                    newTag.name = channel.name;
                    cb(null, newTag);
                  }));
                };
                if (channel) {
                  createTag(channel, cb);
                } else {
                  channels.createImplicitChannel(domain, text, domain.intercept(function (channel) {
                    createTag(channel, cb);
                  }));
                }
              }));
            };
            if (container.owner.toString() === userId.toString()) {
              add();
            } else if (user.permission_level > 1) {
              add();
            } else {
              cb(error(403, 'permission denied'));
            }
          }
        }));
      }
    }));
  },
  removeContainerTag: function (domain, userId, runnableId, tagId, cb) {
    runnableId = decodeId(runnableId);
    containers.findOne({ _id: runnableId }, domain.intercept(function (container) {
      if (!container) {
        cb(error(404, 'runnable not found'));
      } else if (container.owner.toString() !== userId.toString()) {
        users.findOne({ _id: userId }, domain.intercept(function (user) {
          if (!user) {
            cb(error(403, 'user not found'));
          } else if (user.permission_level < 2) {
            cb(error(403, 'permission denied'));
          } else {
            container.tags.id(tagId).remove();
            container.save(domain.intercept(function () {
              cb();
            }));
          }
        }));
      } else {
        container.tags.id(tagId).remove();
        container.save(domain.intercept(function () {
          cb();
        }));
      }
    }));
  },
  searchImages: function (domain, searchText, limit, cb) {
    images.search(domain, searchText, limit, domain.intercept(function (results) {
      arrayToJSON(domain, results, cb);
    }));
  },
  syncFiles: function (domain, userId, runnableId, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.syncFiles(domain, cb);
    }));
  },
  listFiles: function (domain, userId, runnableId, content, dir, default_tag, path, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.listFiles(domain, content, dir, default_tag, path, cb);
    }));
  },
  createFile: function (domain, userId, runnableId, name, path, content, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.createFile(domain, name, path, content, cb);
    }));
  },
  readFile: function (domain, userId, runnableId, fileId, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.readFile(domain, fileId, cb);
    }));
  },
  updateFile: function (domain, userId, runnableId, fileId, content, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.updateFile(domain, fileId, content, cb);
    }));
  },
  updateFileContents: function (domain, userId, runnableId, fileId, content, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.updateFileContents(domain, fileId, content, cb);
    }));
  },
  deleteFile: function (domain, userId, runnableId, fileId, recursive, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.deleteFile(domain, fileId, recursive, cb);
    }));
  },
  renameFile: function (domain, userId, runnableId, fileId, name, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.renameFile(domain, fileId, name, cb);
    }));
  },
  moveFile: function (domain, userId, runnableId, fileId, path, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.moveFile(domain, fileId, path, cb);
    }));
  },
  createDirectory: function (domain, userId, runnableId, name, path, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.createDirectory(domain, name, path, cb);
    }));
  },
  defaultFile: function (domain, userId, runnableId, fileId, isDefault, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.tagFile(domain, fileId, isDefault, cb);
    }));
  },
  getMountedFiles: function (domain, userId, runnableId, fileId, mountDir, cb) {
    fetchContainer(domain, userId, runnableId, domain.intercept(function (container) {
      container.getMountedFiles(domain, fileId, mountDir, cb);
    }));
  },
  getStat: function (domain, userId, runnableId, stat, cb) {
    if (__indexOf.call(stats, stat) < 0) {
      cb(error(400, 'not a valid stat'));
    } else {
      runnableId = decodeId(runnableId);
      async.parallel([
        function (cb) {
          images.findOne({ _id: runnableId }, domain.intercept(function (image) {
            cb(null, image[stat]);
          }));
        },
        function (cb) {
          users.findOne({ _id: userId }, domain.intercept(function (user) {
            cb(null, user[stat]);
          }));
        }
      ], domain.intercept(function (results) {
        cb(null, {
          image: results[0],
          user: results[1]
        });
      }));
    }
  },
  incrementStat: function (domain, userId, runnableId, stat, cb) {
    if (__indexOf.call(stats, stat) < 0) {
      cb(error(400, 'not a valid stat'));
    } else {
      runnableId = decodeId(runnableId);
      var update = { $inc: {} };
      update.$inc[stat] = 1;
      async.parallel([
        function (cb) {
          images.findOneAndUpdate({ _id: runnableId }, update, domain.intercept(function (image) {
            cb(null, image);
          }));
        },
        function (cb) {
          users.findOneAndUpdate({ _id: userId }, update, domain.intercept(function (user) {
            cb(null, user);
          }));
        }
      ], domain.intercept(function (results) {
        encode(domain, results[0].toJSON(), cb);
      }));
    }
  }
};
module.exports = Runnables;
var fetchContainer = function (domain, userId, runnableId, cb) {
  runnableId = decodeId(runnableId);
  async.parallel({
    user: users.findById.bind(users, userId, {permission_level:1}),
    container: containers.findOne.bind(containers, runnableId)
  },
  domain.intercept(function (results) {
    var container = results.container;
    var user = results.user;
    if (!container) {
      cb(error(404, 'runnable not found'));
    } else if (container.owner.toString() !== userId.toString() && !user.isModerator) {
      cb(error(403, 'permission denied'));
    } else {
      cb(null, container);
    }
  }));
};
var arrayToJSON = function (domain, res, cb) {
  async.map(res, function (item, cb) {
    var json = item.toJSON ? item.toJSON() : item;
    encode(domain, json, cb);
  }, cb);
};
var plus = /\+/g;
var slash = /\//g;
var minus = /-/g;
var underscore = /_/g;
var stats = [
  'copies',
  'pastes',
  'cuts',
  'runs',
  'views'
];
var encode = function (domain, json, cb) {
  if (json.files != null) {
    delete json.files;
  }
  json = encodeIdsIn(json);
  json.tags = json.tags || [];
  async.forEach(json.tags, function (tag, cb) {
    channels.findOne({ _id: tag.channel }, domain.intercept(function (channel) {
      if (channel) {
        tag.name = channel.name;
      }
      cb();
    }));
  }, domain.intercept(function () {
    cb(null, json);
  }));
};
var encodeIdsIn = function (json) {
  json._id = encodeId(json._id);
  if (json.parent != null) {
    json.parent = encodeId(json.parent);
  }
  if (json.target != null) {
    json.target = encodeId(json.target);
  }
  if (json.child != null) {
    json.child = encodeId(json.child);
  }
  return json;
};
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
var isObjectId = function (str) {
  return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
};
var isObjectId64 = function (str) {
  str = decodeId(str);
  return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
};