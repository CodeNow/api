var categories, channels, configs, debug, domains, error, express, path, runnables, users;
channels = require('../models/channels');
categories = require('../models/categories');
configs = require('../configs');
debug = require('debug');
domains = require('../domains');
error = require('../error');
express = require('express');
path = require('path');
users = require('../models/users');
runnables = require('../models/runnables');
module.exports = function (parentDomain) {
  var app;
  app = express();
  app.use(domains(parentDomain));
  app.post('/runnables', function (req, res) {
    var from, sync;
    from = req.query.from || 'node.js';
    if (req.query.sync === 'false') {
      sync = false;
    } else {
      sync = true;
    }
    return runnables.createImage(req.domain, req.user_id, from, sync, function (err, image) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(201, image);
      }
    });
  });
  app.get('/runnables', function (req, res, next) {
    var allowedSort, limit, page, sort;
    limit = configs.defaultPageLimit;
    if (req.query.limit != null && req.query.limit <= configs.maxPageLimit) {
      limit = Number(req.query.limit);
    }
    page = 0;
    if (req.query.page != null) {
      page = Number(req.query.page);
    }
    allowedSort = ~[
      '-votes',
      '-created',
      '-views',
      '-runs'
    ].indexOf(req.query.sort);
    sort = allowedSort ? req.query.sort : '-runs';
    if (req.query.search != null) {
      return runnables.searchImages(req.domain, req.query.search, limit, function (err, results) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json(results);
        }
      });
    } else if (req.query.published != null) {
      return runnables.listByPublished(req.domain, sort, limit, page, function (err, results) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json(results);
        }
      });
    } else if (req.query.channel != null) {
      return channels.getChannelsWithNames(req.domain, categories, req.query.channel, function (err, results) {
        var channelIds;
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          channelIds = results.map(function (channel) {
            return channel._id;
          });
          return runnables.listByChannelMembership(req.domain, channelIds, sort, limit, page, function (err, results, paging) {
            if (err) {
              return res.json(err.code, { message: err.msg });
            } else {
              return res.json({
                data: results,
                paging: paging
              });
            }
          });
        }
      });
    } else if (req.query.owner != null) {
      return runnables.listByOwner(req.domain, req.query.owner, sort, limit, page, function (err, results, paging) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json({
            data: results,
            paging: paging
          });
        }
      });
    } else if (req.query.ownerUsername != null) {
      return users.findUser(req.domain, { lower_username: req.query.ownerUsername.toLowerCase() }, function (err, user) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          if (!user) {
            return res.json([]);
          } else {
            return runnables.listByOwner(req.domain, user._id, sort, limit, page, function (err, results, paging) {
              if (err) {
                return res.json(err.code, { message: err.msg });
              } else {
                return res.json({
                  data: results,
                  paging: paging
                });
              }
            });
          }
        }
      });
    } else if (req.query.map != null) {
      return runnables.listNames(req.domain, function (err, results) {
        if (err) {
          return next(err);
        } else {
          return res.json(results);
        }
      });
    } else {
      return runnables.listAll(req.domain, sort, limit, page, function (err, results, paging) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json({
            data: results,
            paging: paging
          });
        }
      });
    }
  });
  app.put('/runnables/:id', function (req, res) {
    if (req.query.from == null) {
      return res.json(400, { message: 'must provide a runnable to save from' });
    } else {
      return runnables.updateImage(req.domain, req.user_id, req.params.id, req.query.from, function (err, image) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json(image);
        }
      });
    }
  });
  app.get('/runnables/:id', function (req, res) {
    return runnables.getImage(req.domain, req.params.id, function (err, runnable) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(runnable);
      }
    });
  });
  app.del('/runnables/:id', function (req, res) {
    return runnables.removeImage(req.domain, req.user_id, req.params.id, function (err) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json({ message: 'runnable deleted' });
      }
    });
  });
  app.get('/runnables/:id/votes', function (req, res) {
    return runnables.getVotes(req.domain, req.params.id, function (err, votes) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(votes);
      }
    });
  });
  app.get('/runnables/:id/tags', function (req, res) {
    return runnables.getTags(req.domain, req.params.id, function (err, tags) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(tags);
      }
    });
  });
  app.post('/runnables/:id/tags', function (req, res) {
    if (req.body.name == null) {
      return res.json(400, { message: 'tag must include a name field' });
    } else {
      return runnables.addTag(req.domain, req.user_id, req.params.id, req.body.name, function (err, tag) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json(201, tag);
        }
      });
    }
  });
  app.get('/runnables/:id/tags/:tagId', function (req, res) {
    return runnables.getTag(req.domain, req.params.id, req.params.tagId, function (err, tag) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(200, tag);
      }
    });
  });
  app.del('/runnables/:id/tags/:tagId', function (req, res) {
    return runnables.removeTag(req.domain, req.user_id, req.params.id, req.params.tagId, function (err) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(200, { message: 'tag deleted' });
      }
    });
  });
  app.get('/runnables/:id/stats/:stat', function (req, res, next) {
    return runnables.getStat(req.domain, req.user_id, req.params.id, req.params.stat, function (err, stats) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(200, stats);
      }
    });
  });
  app.post('/runnables/:id/stats/:stat', function (req, res, next) {
    return runnables.incrementStat(req.domain, req.user_id, req.params.id, req.params.stat, function (err, stats) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(201, stats);
      }
    });
  });
  return app;
};