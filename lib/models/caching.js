var async, channels, configs, getFilteredCachedResults, getUnfilteredCachedResults, images, isCacheDirty, listFields, markCacheAsClean, markCacheAsDirty, redis, redis_client, updateAllCaches, updateAllFilteredCachedResults, updateAllUnfilteredCachedResults, updateFilteredCachedResults, updateSingleFilteredCachedResult, updateSingleUnfilteredCachedResult, users, voteSortPipeline, voteSortPipelineAll, voteSortPipelineFiltered, voteSortPipelineFilteredAll, _;
_ = require('lodash');
async = require('async');
channels = require('./channels');
configs = require('../configs');
images = require('./images');
redis = require('redis');
users = require('./users');
listFields = {
  _id: 1,
  name: 1,
  tags: 1,
  owner: 1,
  created: 1
};
redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress);
markCacheAsDirty = function () {
  var cb;
  cb = function (err) {
    if (err) {
      return console.log(err.message && console.log(err.stack));
    }
  };
  return redis_client.get('sort_cache.block_set_dirty', function (err, value) {
    if (err) {
      return cb(err);
    } else {
      if (value !== 'true') {
        console.log('Marking sort cache as dirty');
        return async.parallel([
          redis_client.setex.bind(redis_client, 'sort_cache.block_set_dirty', 3600, 'true'),
          redis_client.set.bind(redis_client, 'sort_cache.dirty', 'true')
        ], cb);
      }
    }
  });
};
markCacheAsClean = function (cb) {
  return redis_client.set('sort_cache.dirty', 'false', function (err) {
    if (err) {
      return cb(err);
    } else {
      return cb();
    }
  });
};
isCacheDirty = function (cb) {
  return redis_client.get('sort_cache.dirty', function (err, value) {
    if (err) {
      return cb(err);
    } else {
      return cb(null, !value || value === 'true');
    }
  });
};
getUnfilteredCachedResults = function (limit, index, cb) {
  return redis_client.get('sort_cache.' + limit + '-' + index, function (err, value) {
    if (err) {
      return cb(err);
    } else {
      if (value) {
        return cb(null, JSON.parse(value));
      } else {
        return updateSingleUnfilteredCachedResult(limit, index, function (err, value) {
          if (err) {
            return cb(err);
          } else {
            return cb(null, value);
          }
        });
      }
    }
  });
};
getFilteredCachedResults = function (limit, index, channels, cb) {
  return images.find({ 'tags.channel': { $in: channels } }, listFields, function (err, selected) {
    var filter, image, key, _i, _len;
    if (err) {
      return cb(err);
    } else {
      filter = [];
      for (_i = 0, _len = selected.length; _i < _len; _i++) {
        image = selected[_i];
        filter.push(image._id);
      }
      key = 'sort_cache.' + limit + '-' + index;
      channels.forEach(function (channel) {
        key = '' + key + '-' + channel;
      });
      return redis_client.get(key, function (err, value) {
        if (err) {
          return cb(err);
        } else {
          if (value) {
            return cb(null, JSON.parse(value));
          } else {
            return updateSingleFilteredCachedResult(limit, index, channels, function (err, value) {
              if (err) {
                return cb(err);
              } else {
                return cb(null, value);
              }
            });
          }
        }
      });
    }
  });
};
updateSingleUnfilteredCachedResult = function (limit, index, cb) {
  return users.aggregate(voteSortPipeline(limit, index), function (err, results) {
    if (err) {
      return cb(err);
    } else {
      results = results || [];
      return redis_client.set('sort_cache.' + limit + '-' + index, JSON.stringify(results), function (err) {
        if (err) {
          return cb(err);
        } else {
          return cb(null, results);
        }
      });
    }
  });
};
updateSingleFilteredCachedResult = function (limit, index, channels, cb) {
  return images.find({ 'tags.channel': { $in: channels } }, listFields, function (err, selected) {
    var filter, image, _i, _len;
    if (err) {
      return cb(err);
    } else {
      filter = [];
      for (_i = 0, _len = selected.length; _i < _len; _i++) {
        image = selected[_i];
        filter.push(image._id);
      }
      return users.aggregate(voteSortPipelineFiltered(limit, index, filter), function (err, results) {
        var key;
        if (err) {
          return cb(err);
        } else {
          results = results || [];
          key = 'sort_cache.' + limit + '-' + index;
          channels.forEach(function (channel) {
            key = '' + key + '-' + channel;
          });
          return redis_client.set(key, JSON.stringify(results), function (err) {
            if (err) {
              return cb(err);
            } else {
              return cb(null, results);
            }
          });
        }
      });
    }
  });
};
updateAllUnfilteredCachedResults = function (cb) {
  var limit;
  limit = configs.defaultPageLimit;
  return users.aggregate(voteSortPipelineAll(), function (err, results) {
    var i, indices, num_pages;
    if (err) {
      return cb(err);
    } else {
      results = results || [];
      num_pages = Math.ceil(results.length / limit);
      indices = (function () {
        var _i, _results;
        _results = [];
        for (i = _i = 0; 0 <= num_pages ? _i < num_pages : _i > num_pages; i = 0 <= num_pages ? ++_i : --_i) {
          _results.push(i * limit);
        }
        return _results;
      }());
      return async.forEach(indices, function (index, cb) {
        var page;
        page = results.slice(index, index + limit);
        return redis_client.set('sort_cache.' + limit + '-' + index, JSON.stringify(page), cb);
      }, cb);
    }
  });
};
updateFilteredCachedResults = function (channels, cb) {
  return images.find({ 'tags.channel': { $in: channels } }, listFields, function (err, selected) {
    var filter, image, limit, _i, _len;
    if (err) {
      return cb(err);
    } else {
      filter = [];
      for (_i = 0, _len = selected.length; _i < _len; _i++) {
        image = selected[_i];
        filter.push(image._id);
      }
      limit = configs.defaultPageLimit;
      return users.aggregate(voteSortPipelineFilteredAll(filter), function (err, results) {
        var i, indices, num_pages;
        if (err) {
          return cb(err);
        } else {
          results = results || [];
          num_pages = Math.ceil(results.length / limit);
          indices = (function () {
            var _j, _results;
            _results = [];
            for (i = _j = 0; 0 <= num_pages ? _j < num_pages : _j > num_pages; i = 0 <= num_pages ? ++_j : --_j) {
              _results.push(i * limit);
            }
            return _results;
          }());
          return async.forEach(indices, function (index, cb) {
            var key, page;
            page = results.slice(index, index + limit);
            key = 'sort_cache.' + limit + '-' + index;
            channels.forEach(function (channel) {
              key = '' + key + '-' + channel;
            });
            return redis_client.set(key, JSON.stringify(page), cb);
          }, cb);
        }
      });
    }
  });
};
updateAllFilteredCachedResults = function (cb) {
  return channels.find({}, function (err, results) {
    results = results || [];
    return async.forEachSeries(results, function (channel, cb) {
      return updateFilteredCachedResults([channel._id], cb);
    }, cb);
  });
};
updateAllCaches = function (req, res) {
  return users.findUser(req.domain, { _id: req.user_id }, function (err, user) {
    if (err) {
      return res.json(500, { message: 'error looking up user in mongodb' });
    } else {
      if (!user) {
        return res.json(500, { message: 'user not found' });
      } else {
        if (!user.isModerator) {
          return res.json(403, { message: 'permission denied' });
        } else {
          return isCacheDirty(function (err, dirty) {
            if (err) {
              return res.json(500, { message: 'error checking cache dirty flag' });
            } else {
              if (!dirty) {
                return res.json({ message: 'cache is not dirty, skipping refresh' });
              } else {
                return markCacheAsClean(function (err) {
                  if (err) {
                    return res.json(500, { message: 'error marking cache as clean' });
                  } else {
                    return updateAllFilteredCachedResults(function (err) {
                      if (err) {
                        return res.json(500, { message: 'error refreshing filtered redis cache' });
                      } else {
                        return updateAllUnfilteredCachedResults(function (err) {
                          if (err) {
                            return res.json(500, { message: 'error refreshing redis cache' });
                          } else {
                            return res.json({ message: 'redis cache refreshed' });
                          }
                        });
                      }
                    });
                  }
                });
              }
            }
          });
        }
      }
    }
  });
};
voteSortPipeline = function (limit, index) {
  return [
    {
      $project: {
        _id: 0,
        votes: '$votes.runnable'
      }
    },
    { $unwind: '$votes' },
    {
      $group: {
        _id: '$votes',
        number: { $sum: 1 }
      }
    },
    { $sort: { number: -1 } },
    { $skip: index },
    { $limit: limit }
  ];
};
voteSortPipelineFiltered = function (limit, index, filter) {
  return [
    {
      $project: {
        _id: 0,
        votes: '$votes.runnable'
      }
    },
    { $unwind: '$votes' },
    { $match: { votes: { $in: filter } } },
    {
      $group: {
        _id: '$votes',
        number: { $sum: 1 }
      }
    },
    { $sort: { number: -1 } },
    { $skip: index },
    { $limit: limit }
  ];
};
voteSortPipelineAll = function () {
  return [
    {
      $project: {
        _id: 0,
        votes: '$votes.runnable'
      }
    },
    { $unwind: '$votes' },
    {
      $group: {
        _id: '$votes',
        number: { $sum: 1 }
      }
    },
    { $sort: { number: -1 } }
  ];
};
voteSortPipelineFilteredAll = function (filter) {
  return [
    {
      $project: {
        _id: 0,
        votes: '$votes.runnable'
      }
    },
    { $unwind: '$votes' },
    { $match: { votes: { $in: filter } } },
    {
      $group: {
        _id: '$votes',
        number: { $sum: 1 }
      }
    },
    { $sort: { number: -1 } }
  ];
};
module.exports = {
  voteSortPipelineFiltered: voteSortPipelineFiltered,
  getUnfilteredCachedResults: getUnfilteredCachedResults,
  getFilteredCachedResults: getFilteredCachedResults,
  updateAllCaches: updateAllCaches,
  markCacheAsDirty: markCacheAsDirty
};