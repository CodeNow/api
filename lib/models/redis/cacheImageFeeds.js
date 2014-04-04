var async = require('async');
var redis = require('models/redis');
var Images = require('models/images');
var ImageFeed = require('models/feeds/ImageFeed');
var globalFeed = new ImageFeed('global');

module.exports = cacheImageFeeds;

function cacheImageFeeds (cb) {
  var statsFields = {
    _id: 1,
    runs: 1,
    created: 1,
    tags: 1
  };
  async.waterfall([
    Images.findPublished.bind(Images, {}, statsFields),
    addAllToFeeds
  ], cb);

  function addAllToFeeds (images, cb) {
    async.forEach(images, addToFeeds, cb);
  }

  function addToFeeds (image, cb) {
    var tasks = [
      // add to global feed task
      globalFeed.add.bind(globalFeed, image)
    ].concat(
      // each add to channel feed task
      image.tags.map(channelFeedAdd)
    );

    async.parallel(tasks, cb);

    function channelFeedAdd (tag, i, tags) {
      var channelFeed = new ImageFeed(tag.channel.toString());
      return channelFeed.add.bind(channelFeed, image);
    }
  }
}