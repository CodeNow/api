var redis = require('models/redis');
var Images = require('models/images');
var utils = require('middleware/utils');

var cacheImagesFeed = function(cb) {
  var project = {
    $project: {
      _id: 1,
      runs: 1,
      created: 1,
      tags: 1
    }
  };
  var match = {
    $match: {
      'tags.0': {
        $exists: true
      }
    }
  };
  Images.aggregate(project, match).exec(processData);

  function calculateScore(runs, hours) {
    return (runs + 3) / Math.pow(hours + 2, 1.5);
  }

  function handleError(err, res) {
    if (err) {
      cb(err);
    }
  }

  function addToRedis(id, score, tags) {
    redis.zadd(['imagefeed_global', score, id], handleError);
    redis.expire('imagefeed_global', 60, handleError); // TODO: determine update rate
    tags.forEach(function(tag) {
      redis.zadd(['imagefeed_' + tag.channel, score, id], handleError);
      redis.expire('imagefeed_' + tag.channel, 60, handleError); // TODO: determine update rate
    });
  }

  function processData(err, data) {
    if (err) {
      return cb(err);
    }
    else if (data.length === 0) {
      return cb();
    }
    var now = new Date();
    var then = new Date();
    data.forEach(function(d) {
      d.runs = (d.runs) ? d.runs : 0;
      then = new Date(d.created);
      var hours = Math.abs(now - then) / 1000 / 60 / 60;
      var score = calculateScore(d.runs, hours);
      if (!isNaN(score)) {
        addToRedis(d._id, score, d.tags);
      }
    });
    cb();
  }
};

module.exports.cacheImagesFeed = cacheImagesFeed;
