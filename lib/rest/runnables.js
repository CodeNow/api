var channels = require('../models/channels');
var categories = require('../models/categories');
var configs = require('../configs');
var domains = require('../domains');
var express = require('express');
var users = require('../models/users');
var runnables = require('../models/runnables');
var app = module.exports = express();
app.post('/runnables', function (req, res) {
  var sync;
  var from = req.query.from || 'node.js';
  if (req.query.sync === 'false') {
    sync = false;
  } else {
    sync = true;
  }
  runnables.createImage(req.domain, req.user_id, from, sync, function (err, image) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(201, image);
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
    runnables.searchImages(req.domain, req.query.search, limit, function (err, results) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json(results);
      }
    });
  } else if (req.query.published != null) {
    runnables.listByPublished(req.domain, sort, limit, page, function (err, results) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json(results);
      }
    });
  } else if (req.query.channel != null) {
    channels.getChannelsWithNames(req.domain, categories, req.query.channel, function (err, results) {
      var channelIds;
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        channelIds = results.map(function (channel) {
          return channel._id;
        });
        runnables.listByChannelMembership(req.domain, channelIds, sort, limit, page, function (err, results, paging) {
          if (err) {
            res.json(err.code, { message: err.msg });
          } else {
            res.json({
              data: results,
              paging: paging
            });
          }
        });
      }
    });
  } else if (req.query.owner != null) {
    runnables.listByOwner(req.domain, req.query.owner, sort, limit, page, function (err, results, paging) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json({
          data: results,
          paging: paging
        });
      }
    });
  } else if (req.query.ownerUsername != null) {
    users.findUser(req.domain, { lower_username: req.query.ownerUsername.toLowerCase() }, function (err, user) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        if (!user) {
          res.json([]);
        } else {
          runnables.listByOwner(req.domain, user._id, sort, limit, page, function (err, results, paging) {
            if (err) {
              res.json(err.code, { message: err.msg });
            } else {
              res.json({
                data: results,
                paging: paging
              });
            }
          });
        }
      }
    });
  } else if (req.query.map != null) {
    runnables.listNames(req.domain, function (err, results) {
      if (err) {
        next(err);
      } else {
        res.json(results);
      }
    });
  } else {
    runnables.listAll(req.domain, sort, limit, page, function (err, results, paging) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json({
          data: results,
          paging: paging
        });
      }
    });
  }
});
app.put('/runnables/:id', function (req, res) {
  if (req.query.from == null) {
    res.json(400, { message: 'must provide a runnable to save from' });
  } else {
    runnables.updateImage(req.domain, req.user_id, req.params.id, req.query.from, function (err, image) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json(image);
      }
    });
  }
});
app.get('/runnables/:id', function (req, res) {
  runnables.getImage(req.domain, req.params.id, function (err, runnable) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(runnable);
    }
  });
});
app.del('/runnables/:id', function (req, res) {
  runnables.removeImage(req.domain, req.user_id, req.params.id, function (err) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json({ message: 'runnable deleted' });
    }
  });
});
app.get('/runnables/:id/votes', function (req, res) {
  runnables.getVotes(req.domain, req.params.id, function (err, votes) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(votes);
    }
  });
});
app.get('/runnables/:id/tags', function (req, res) {
  runnables.getTags(req.domain, req.params.id, function (err, tags) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(tags);
    }
  });
});
app.post('/runnables/:id/tags', function (req, res) {
  if (req.body.name == null) {
    res.json(400, { message: 'tag must include a name field' });
  } else {
    runnables.addTag(req.domain, req.user_id, req.params.id, req.body.name, function (err, tag) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json(201, tag);
      }
    });
  }
});
app.get('/runnables/:id/tags/:tagId', function (req, res) {
  runnables.getTag(req.domain, req.params.id, req.params.tagId, function (err, tag) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(200, tag);
    }
  });
});
app.del('/runnables/:id/tags/:tagId', function (req, res) {
  runnables.removeTag(req.domain, req.user_id, req.params.id, req.params.tagId, function (err) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(200, { message: 'tag deleted' });
    }
  });
});
app.get('/runnables/:id/stats/:stat', function (req, res, next) {
  runnables.getStat(req.domain, req.user_id, req.params.id, req.params.stat, function (err, stats) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(200, stats);
    }
  });
});
app.post('/runnables/:id/stats/:stat', function (req, res, next) {
  runnables.incrementStat(req.domain, req.user_id, req.params.id, req.params.stat, function (err, stats) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(201, stats);
    }
  });
});