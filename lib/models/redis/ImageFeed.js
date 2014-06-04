var util = require('util');
var async = require('async');
var RedisSortedSet = require('models/redis/SortedSet');
var pluck = require('101/pluck');
var Image = require('models/images');

module.exports = ImageFeed;

function ImageFeed (tag) {
  this.tag = tag;
  this.key = 'imagefeed_'+tag;
}

util.inherits(ImageFeed, RedisSortedSet);
ImageFeed.prototype.super = RedisSortedSet.prototype;

ImageFeed.prototype.add = function (image, cb) {
  var data = [ image.getScore(), image._id ];

  async.parallel([
    this.super.add.bind(this, data),
    this.expire.bind(this, 60)
  ], cb);
};

// ImageFeed.prototype.range = function (start, end, cb) {
//   async.waterfall([
//     this.super.range.bind(this, start, end),
//     getImages
//   ], cb);

//   function getImages (err, results) {
//     if (err) {
//       cb(err);
//     }
//     var imageIds = [];
//     var scoreHash = {};
//     results.forEach(function (result) {
//       var score = result[0];
//       var imageId = result[1];
//       imageIds.push(imageId);
//       scoreHash[imageId] = score;
//     });

//     Image.findByIds(imageIds, {files:0}, function (err, images) {
//       images.map(function (image) {
//         // add score to image
//         image.set('score', imageHash[image._id.toString()], { strict: false });
//       });
//       cb(null, images);
//     });
//   }
// };