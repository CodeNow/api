var async = require('async');
var channels = require('./channels');
var configs = require('../configs');
var images = require('./images');
var redis = require('redis');
var users = require('./users');
var listFields = {
  _id: 1,
  name: 1,
  tags: 1,
  owner: 1,
  created: 1
};
var redis_client = redis.createClient(configs.redis.port, configs.redis.ipaddress);
var markCacheAsDirty = function () {
  var cb;
  cb = function (err) {
    if (err) {
      console.error(err.message && console.log(err.stack));
    }
  };
  redis_client.get('sort_cache.block_set_dirty', function (err, value) {
    if (err) {
      cb(err);
    } else {
      if (value !== 'true') {
        console.log('Marking sort cache as dirty');
        async.parallel([
          redis_client.setex.bind(redis_client, 'sort_cache.block_set_dirty', 3600, 'true'),
          redis_client.set.bind(redis_client, 'sort_cache.dirty', 'true')
        ], cb);
      }
    }
  });
};
var markCacheAsClean = function (cb) {
  redis_client.set('sort_cache.dirty', 'false', function (err) {
    if (err) {
      cb(err);
    } else {
      cb();
    }
  });
};
var isCacheDirty = function (cb) {
  redis_client.get('sort_cache.dirty', function (err, value) {
    if (err) {
      cb(err);
    } else {
      cb(null, !value || value === 'true');
    }
  });
};
var getUnfilteredCachedResults = function (limit, index, cb) {
  redis_client.get('sort_cache.' + limit + '-' + index, function (err, value) {
    if (err) {
      cb(err);
    } else {
      if (value) {
        cb(null, JSON.parse(value));
      } else {
        updateSingleUnfilteredCachedResult(limit, index, function (err, value) {
          if (err) {
            cb(err);
          } else {
            cb(null, value);
          }
        });
      }
    }
  });
};
var getFilteredCachedResults = function (limit, index, channels, cb) {
  images.find({ 'tags.channel': { $in: channels } }, listFields, function (err, selected) {
    var filter, image, key, _i, _len;
    if (err) {
      cb(err);
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
      redis_client.get(key, function (err, value) {
        if (err) {
          cb(err);
        } else {
          if (value) {
            cb(null, JSON.parse(value));
          } else {
            updateSingleFilteredCachedResult(limit, index, channels, function (err, value) {
              if (err) {
                cb(err);
              } else {
                cb(null, value);
              }
            });
          }
        }
      });
    }
  });
};
var updateSingleUnfilteredCachedResult = function (limit, index, cb) {
  users.aggregate(voteSortPipeline(limit, index), function (err, results) {
    if (err) {
      cb(err);
    } else {
      results = results || [];
      redis_client.set('sort_cache.' + limit + '-' + index, JSON.stringify(results), function (err) {
        if (err) {
          cb(err);
        } else {
          cb(null, results);
        }
      });
    }
  });
};
var updateSingleFilteredCachedResult = function (limit, index, channels, cb) {
  images.find({ 'tags.channel': { $in: channels } }, listFields, function (err, selected) {
    var filter, image, _i, _len;
    if (err) {
      cb(err);
    } else {
      filter = [];
      for (_i = 0, _len = selected.length; _i < _len; _i++) {
        image = selected[_i];
        filter.push(image._id);
      }
      users.aggregate(voteSortPipelineFiltered(limit, index, filter), function (err, results) {
        var key;
        if (err) {
          cb(err);
        } else {
          results = results || [];
          key = 'sort_cache.' + limit + '-' + index;
          channels.forEach(function (channel) {
            key = '' + key + '-' + channel;
          });
          redis_client.set(key, JSON.stringify(results), function (err) {
            if (err) {
              cb(err);
            } else {
              cb(null, results);
            }
          });
        }
      });
    }
  });
};
var updateAllUnfilteredCachedResults = function (cb) {
  var limit;
  limit = configs.defaultPageLimit;
  users.aggregate(voteSortPipelineAll(), function (err, results) {
    var i, indices, num_pages;
    if (err) {
      cb(err);
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
      async.forEach(indices, function (index, cb) {
        var page;
        page = results.slice(index, index + limit);
        redis_client.set('sort_cache.' + limit + '-' + index, JSON.stringify(page), cb);
      }, cb);
    }
  });
};
var updateFilteredCachedResults = function (channels, cb) {
  images.find({ 'tags.channel': { $in: channels } }, listFields, function (err, selected) {
    var filter, image, limit, _i, _len;
    if (err) {
      cb(err);
    } else {
      filter = [];
      for (_i = 0, _len = selected.length; _i < _len; _i++) {
        image = selected[_i];
        filter.push(image._id);
      }
      limit = configs.defaultPageLimit;
      users.aggregate(voteSortPipelineFilteredAll(filter), function (err, results) {
        var i, indices, num_pages;
        if (err) {
          cb(err);
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
          async.forEach(indices, function (index, cb) {
            var key, page;
            page = results.slice(index, index + limit);
            key = 'sort_cache.' + limit + '-' + index;
            channels.forEach(function (channel) {
              key = '' + key + '-' + channel;
            });
            redis_client.set(key, JSON.stringify(page), cb);
          }, cb);
        }
      });
    }
  });
};
var updateAllFilteredCachedResults = function (cb) {
  channels.find({}, function (err, results) {
    if (err) {
      cb(err);
    } else {
      results = results || [];
      async.forEachSeries(results, function (channel, cb) {
        updateFilteredCachedResults([channel._id], cb);
      }, cb);
    }
  });
};
var updateAllCaches = function (req, res) {
  users.findUser(req.domain, { _id: req.user_id }, function (err, user) {
    if (err) {
      res.json(500, { message: 'error looking up user in mongodb' });
    } else if (!user) {
      res.json(500, { message: 'user not found' });
    } else if (!user.isModerator) {
      res.json(403, { message: 'permission denied' });
    } else {
      isCacheDirty(function (err, dirty) {
        if (err) {
          res.json(500, { message: 'error checking cache dirty flag' });
        } else if (!dirty) {
          res.json({ message: 'cache is not dirty, skipping refresh' });
        } else {
          markCacheAsClean(function (err) {
            if (err) {
              res.json(500, { message: 'error marking cache as clean' });
            } else {
              updateAllFilteredCachedResults(function (err) {
                if (err) {
                  res.json(500, { message: 'error refreshing filtered redis cache' });
                } else {
                  updateAllUnfilteredCachedResults(function (err) {
                    if (err) {
                      res.json(500, { message: 'error refreshing redis cache' });
                    } else {
                      res.json({ message: 'redis cache refreshed' });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
};
var voteSortPipeline = function (limit, index) {
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
var voteSortPipelineFiltered = function (limit, index, filter) {
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
var voteSortPipelineAll = function () {
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
var voteSortPipelineFilteredAll = function (filter) {
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