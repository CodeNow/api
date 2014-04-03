var _ = require('lodash');
var async = require('async');
var ImageFeed = require('models/feeds/ImageFeed');
var Image = require('models/images');
var pluck = require('map-utils').pluck;

module.exports = Intersection;

function Intersection (tags /* tags... */) {
  tags = Array.isArray(tags) ? tags :
    Array.prototype.slice.call(arguments);
  this.tags = _.unique(tags);
}

Intersection.prototype.range = function (start, end, cb) {
  var limit = end+1 - start;
  async.waterfall([
    async.reduce.bind(async, this.tags, [], toFeedData),
    getImages
  ], cb);

  function toFeedData (feedResults, tag, cb) {
    var feed = new ImageFeed(tag);
    feed.listAll(function (err, resultsArr) {
      if (err) {
        cb(err);
      }
      else {
        var results = [];
        while (resultsArr.length) {
          results.push([
            resultsArr.pop(), // score
            resultsArr.pop()  // imageId
          ]);
        }
        feedResults.push.apply(feedResults, results);
        cb(null, feedResults);
      }
    });
  }

  function getImages (feedResults, cb) {
    var results = feedResults
      .sort(sortBy(1)) // score is position 0
      .slice(start, end+1);

    var imageIds = [];
    var scoreHash = {};
    results
      .sort(sortBy(0)) // sortBy score
      .forEach(function (result) {
        var score = result[0];
        var imageId = result[1];
        imageIds.push(imageId);
        scoreHash[imageId] = score;
      });

    var paging = {
      lastPage: Math.ceil(feedResults.length / limit) - 1
    };

    Image.findByIds(imageIds, {files:0}, function (err, images) {
      images = images.map(addScore);
      cb(null, images, paging, feedResults);
    });

    function addScore (image) {
      image.set('score', scoreHash[image._id.toString()], { strict: false });
      return image;
    }
  }
};

function sortBy (attr) {
  return function (a, b) {
    return b[attr] - a[attr];
  };
}
