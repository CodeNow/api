var users = require('../middleware/users');
var channels = require('../middleware/channels');
var body = require('../middleware/body');
var params = require('../middleware/params');
var utils = require('../middleware/utils');
var express = require('express');
var ternary = utils.ternary;
var series = utils.series;

var app = module.exports = express();


app.post('/channels',
  users.isModerator,
  body.require('name'),
  params.setFromBody('channelName', 'name'),
  ternary(channels.fetchChannel,
    utils.message(409, 'name already exists'),
    series(
      channels.createChannel,
      channels.saveChannel)
  ),
  channels.returnChannel);





// app.post('/oldchannels', function (req, res) {
//   channels.createChannel(req.domain, req.user_id, req.body.name, req.body.description, req.domain.intercept(function (channel) {
//     res.json(201, channel);
//   }));
// });
// app.get('/oldchannels', function (req, res) {
//   var sendJSON = req.domain.intercept(function (result) {
//     res.json(result);
//   });
//   if (req.query.name != null) {
//     channels.getChannelByName(req.domain, categories, req.query.name, sendJSON);
//   } else if (req.query.names != null) {
//     channels.getChannelsWithNames(req.domain, categories, req.query.names, sendJSON);
//   } else if (req.query.category != null) {
//     channels.listChannelsInCategory(req.domain, categories, req.query.category, sendJSON);
//   } else if (req.query.channel != null) {
//     channels.relatedChannels(req.domain, [].concat(req.query.channel), sendJSON);
//   } else if (req.query.popular != null) {
//     channels.mostPopAffectedByUser(req.domain, Math.min(req.query.count, 5), req.query.userId, sendJSON);
//   } else if (req.query.badges != null) {
//     channels.leaderBadgesInChannelsForUser(req.domain, Math.min(req.query.count, 5), [].concat(req.query.channelIds), req.query.userId, sendJSON);
//   } else {
//     channels.listChannels(req.domain, categories, sendJSON);
//   }
// });
// app.get('/oldchannels/:id', function (req, res) {
//   channels.getChannel(req.domain, categories, req.params.id, req.domain.intercept(function (channel) {
//     res.json(channel);
//   }));
// });
// app.del('/oldchannels/:id', function (req, res) {
//   channels.deleteChannel(req.domain, req.user_id, req.params.id, req.domain.intercept(function () {
//     res.json({ message: 'channel deleted' });
//   }));
// });
// app.put('/oldchannels/:id/aliases', function (req, res) {
//   channels.updateAliases(req.domain, req.user_id, req.params.id, req.body, req.domain.intercept(function (channel) {
//     res.json(channel.aliases);
//   }));
// });
// app.get('/oldchannels/:id/tags', function (req, res) {
//   channels.getTags(req.domain, categories, req.params.id, req.domain.intercept(function (tags) {
//     res.json(tags);
//   }));
// });
// app.post('/oldchannels/:id/tags', function (req, res) {
//   channels.addTag(req.domain, categories, req.user_id, req.params.id, req.body.name, req.domain.intercept(function (tag) {
//     res.json(201, tag);
//   }));
// });
// app.get('/oldchannels/:id/tags/:tagid', function (req, res) {
//   channels.getTag(req.domain, categories, req.params.id, req.params.tagid, req.domain.intercept(function (tag) {
//     res.json(tag);
//   }));
// });
// app.del('/oldchannels/:id/tags/:tagid', function (req, res) {
//   channels.removeTag(req.domain, req.user_id, req.params.id, req.params.tagid, req.domain.intercept(function () {
//     res.json({ message: 'tag deleted' });
//   }));
// });