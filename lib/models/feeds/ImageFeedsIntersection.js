var _ = require('lodash');
var async = require('async');
var ImageFeed = require('models/feeds/ImageFeed');
var Image = require('models/images');
var pluck = require('101/pluck');

module.exports = Intersection;

function Intersection (tags /* tags... */) {
  tags = Array.isArray(tags) ? tags :
    Array.prototype.slice.call(arguments);
  this.tags = _.unique(tags);
}

Intersection.prototype.range = function (start, end, cb) {
  async.waterfall([
    async.reduce.bind(async, this.tags, [], toFeedData),
    getImages
  ], cb);

  function toFeedData (allFeedResults, tag, cb) {
    var feed = new ImageFeed(tag);
    feed.listAll(function (err, resultsArr) {
      if (err) {
        cb(err);
      }
      else {
        var results = [];
        while (resultsArr.length) {
          // push into rows [[score, id], [...], ...]
          results.push([
            resultsArr.pop(), // score
            resultsArr.pop()  // imageId
          ]);
        }
        allFeedResults.push(results);
        cb(null, allFeedResults);
      }
    });
  }

  function getImages (allFeedResults, cb) {
    var feedResults = intersectionByImageId(allFeedResults);
    var results = feedResults
      .sort(sortBy(0)) // score is position 0
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

    Image.findByIds(imageIds, {files:0}, function (err, images) {
      images = images.map(addScore);
      cb(null, images, feedResults);
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



function intersectionByImageId (allFeedResults) {
  return allFeedResults.reduce(toIntersection, []);

  function toIntersection (intersection, feedResults) {
    return intersection.concat(
      feedResults.filter(intersecting)
    );

    function intersecting (result) {
      var imageId = result[1];
      return allFeedResults.every(containsImageId(imageId));
    }

    function containsImageId (imageId) {
      return function (otherFeedResults) {
        if (otherFeedResults === feedResults) {
          return true;
        }
        return otherFeedResults.some(function (result) {
          var otherImageId = result[1];
          return otherImageId === imageId;
        });
      };
    }
  }
}