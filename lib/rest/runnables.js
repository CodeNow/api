var channels = require('../models/channels');
var categories = require('../models/categories');
var configs = require('../configs');
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
  runnables.createImage(req.domain, req.user_id, from, sync, req.domain.intercept(function (image) {
    res.json(201, image);
  }));
});
function filterSort (sort) {
  var allowedSort = ~[
    '-votes',
    '-created',
    '-views',
    '-runs'
  ].indexOf(sort);
  return allowedSort ? sort : '-runs';
}
// app.get('/runnables', function (req, res, next) {
//   var limit = req.query.limit != null && req.query.limit <= configs.maxPageLimit ?
//     Number(req.query.limit) :
//     configs.defaultPageLimit;
//   var page = req.query.page != null ? Number(req.query.page) : 0;
//   var sort = filterSort(req.query.sort);
//   if (req.query.search != null) {
//     runnables.searchImages(req.domain, req.query.search, limit, req.domain.intercept(function (results) {
//       res.json(results);
//     }));
//   } else if (req.query.published != null) {
//     runnables.listByPublished(req.domain, sort, limit, page, req.domain.intercept(function (results) {
//       res.json(results);
//     }));
//   } else if (req.query.channel != null) {
//     channels.getChannelsWithNames(req.domain, categories, req.query.channel, req.domain.intercept(function (results) {
//       var channelIds = results.map(function (channel) {
//         return channel._id;
//       });
//       runnables.listByChannelMembership(req.domain, channelIds, sort, limit, page, req.domain.intercept(function (results, paging) {
//         res.json({
//           data: results,
//           paging: paging
//         });
//       }));
//     }));
//   } else if (req.query.owner != null) {
//     runnables.listByOwner(req.domain, req.query.owner, sort, limit, page, req.domain.intercept(function (results, paging) {
//       res.json({
//         data: results,
//         paging: paging
//       });
//     }));
//   } else if (req.query.ownerUsername != null) {
//     users.findUser(req.domain, { lower_username: req.query.ownerUsername.toLowerCase() }, req.domain.intercept(function (user) {
//       if (!user) {
//         res.json([]);
//       } else {
//         runnables.listByOwner(req.domain, user._id, sort, limit, page, req.domain.intercept(function (results, paging) {
//           res.json({
//             data: results,
//             paging: paging
//           });
//         }));
//       }
//     }));
//   } else if (req.query.map != null) {
//     runnables.listNames(req.domain, req.domain.intercept(function (results) {
//       res.json(results);
//     }));
//   } else {
//     runnables.listAll(req.domain, sort, limit, page, req.domain.intercept(function (results, paging) {
//       res.json({
//         data: results,
//         paging: paging
//       });
//     }));
//   }
// });
app.put('/runnables/:id', function (req, res) {
  if (req.query.from == null) {
    res.json(400, { message: 'must provide a runnable to save from' });
  } else {
    runnables.updateImage(req.domain, req.user_id, req.params.id, req.query.from, req.domain.intercept(function (image) {
      res.json(image);
    }));
  }
});
app.get('/runnables/:id', function (req, res) {
  runnables.getImage(req.domain, req.params.id, req.domain.intercept(function (runnable) {
    res.json(runnable);
  }));
});
app.del('/runnables/:id', function (req, res) {
  runnables.removeImage(req.domain, req.user_id, req.params.id, req.domain.intercept(function (){
    res.json({ message: 'runnable deleted' });
  }));
});
app.get('/runnables/:id/votes', function (req, res) {
  runnables.getVotes(req.domain, req.params.id, req.domain.intercept(function (votes) {
    res.json(votes);
  }));
});
app.get('/runnables/:id/tags', function (req, res) {
  runnables.getTags(req.domain, req.params.id, req.domain.intercept(function (tags) {
    res.json(tags);
  }));
});
app.post('/runnables/:id/tags', function (req, res) {
  if (req.body.name == null) {
    res.json(400, { message: 'tag must include a name field' });
  } else {
    runnables.addTag(req.domain, req.user_id, req.params.id, req.body.name, req.domain.intercept(function (tag) {
      res.json(201, tag);
    }));
  }
});
app.get('/runnables/:id/tags/:tagId', function (req, res) {
  runnables.getTag(req.domain, req.params.id, req.params.tagId, req.domain.intercept(function (tag) {
    res.json(200, tag);
  }));
});
app.del('/runnables/:id/tags/:tagId', function (req, res) {
  runnables.removeTag(req.domain, req.user_id, req.params.id, req.params.tagId, req.domain.intercept(function (){
    res.json(200, { message: 'tag deleted' });
  }));
});
app.get('/runnables/:id/stats/:stat', function (req, res, next) {
  runnables.getStat(req.domain, req.user_id, req.params.id, req.params.stat, req.domain.intercept(function (stats) {
    res.json(200, stats);
  }));
});
app.post('/runnables/:id/stats/:stat', function (req, res, next) {
  runnables.incrementStat(req.domain, req.user_id, req.params.id, req.params.stat, req.domain.intercept(function (stats) {
    res.json(201, stats);
  }));
});