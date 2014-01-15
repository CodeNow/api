var categories = require('../models/categories');
var channels = require('../models/channels');
var express = require('express');
var app = module.exports = express();
app.post('/channels', function (req, res) {
  channels.createChannel(req.domain, req.user_id, req.body.name, req.body.description, function (err, channel) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(201, channel);
    }
  });
});
app.get('/channels', function (req, res) {
  var count;
  var sendJSON = req.domain.intercept(function (result) {
    res.json(result);
  });
  if (req.query.name != null) {
    channels.getChannelByName(req.domain, categories, req.query.name, sendJSON);
  } else if (req.query.names != null) {
    channels.getChannelsWithNames(req.domain, categories, req.query.names, sendJSON);
  } else if (req.query.category != null) {
    channels.listChannelsInCategory(req.domain, categories, req.query.category, sendJSON);
  } else if (req.query.channel != null) {
    var channelNames = Array.isArray(req.query.channel) ? req.query.channel : [req.query.channel];
    channels.relatedChannels(req.domain, channelNames, sendJSON);
  } else if (req.query.popular != null) {
    count = req.query.count;
    count = count && count <= 5 ? count : 5;
    channels.mostPopAffectedByUser(req.domain, count, req.query.userId, sendJSON);
  } else if (req.query.badges != null) {
    count = req.query.count;
    count = count && count <= 5 ? count : 5;
    channels.leaderBadgesInChannelsForUser(req.domain, count, [].concat(req.query.channelIds), req.query.userId, sendJSON);
  } else {
    channels.listChannels(req.domain, categories, sendJSON);
  }
});
app.get('/channels/:id', function (req, res) {
  channels.getChannel(req.domain, categories, req.params.id, function (err, channel) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(channel);
    }
  });
});
app.del('/channels/:id', function (req, res) {
  channels.deleteChannel(req.domain, req.user_id, req.params.id, function (err) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json({ message: 'channel deleted' });
    }
  });
});
app.put('/channels/:id/aliases', function (req, res) {
  channels.updateAliases(req.domain, req.user_id, req.params.id, req.body, function (err, channel) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(channel.aliases);
    }
  });
});
app.get('/channels/:id/tags', function (req, res) {
  channels.getTags(req.domain, categories, req.params.id, function (err, tags) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(tags);
    }
  });
});
app.post('/channels/:id/tags', function (req, res) {
  channels.addTag(req.domain, categories, req.user_id, req.params.id, req.body.name, function (err, tag) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(201, tag);
    }
  });
});
app.get('/channels/:id/tags/:tagid', function (req, res) {
  channels.getTag(req.domain, categories, req.params.id, req.params.tagid, function (err, tag) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(tag);
    }
  });
});
app.del('/channels/:id/tags/:tagid', function (req, res) {
  channels.removeTag(req.domain, req.user_id, req.params.id, req.params.tagid, function (err) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json({ message: 'tag deleted' });
    }
  });
});