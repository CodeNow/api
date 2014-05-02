var async = require('async');
var _ = require('lodash');
var error = require('error');
var redis = require('models/redis');
var cacheImagesFeeds = require('models/redis/cacheImageFeeds');
var Image = require('models/images');
var Channel = require('models/channels');
var configs = require('configs');
var utils = require('middleware/utils');
var keypather = require('keypather')();
var createMongooseMiddleware = require('./createMongooseMiddleware');
var series = utils.series;
var pluck = require('101/pluck');

var ImageFeed = require('models/feeds/ImageFeed');
var ImageFeedsIntersection = require('models/feeds/ImageFeedsIntersection');


var images = module.exports = createMongooseMiddleware(Image, {
  createFromContainer: function (containerKey) {
    var containers = require('middleware/containers');
    return series(
      images.create({ owner: 'user_id' }),
      images.model.inheritFromContainer(containerKey),
      containers.model.addChild('image'),
      containers.model.save(),
      images.model.save()
    );
  },
  updateImageFromContainer: function (imageKey, containerKey) {
    var containers = require('middleware/containers');
    return series(
      images.model.inheritFromContainer(containerKey),
      containers.model.addChild(imageKey),
      containers.model.save(),
      images.model.save()
    );
  },
  checkRedisHealth: function (req, res, next) {
    var feed = 'global';
    var globalFeed = new ImageFeed('global');
    globalFeed.exists(function (err, exists) {
      if (err) {
        next(err);
      }
      else if (exists === 1) {
        next();
      }
      else {
        cacheImagesFeeds(next);
      }
    });
  },
  getFeedPage: function (req, res, next) {
    var channelIds = req.channels && req.channels.length ?
      req.channels.map(pluck('_id')) : ['global'];
    var page = parseInt(req.query.page);
    var limit = parseInt(req.query.limit);
    var start = page * limit;
    var end   = start + limit - 1;
    var pluralKey = this.pluralKey;

    var feeds = new ImageFeedsIntersection(channelIds);
    feeds.range(start, end, function (err, images, feedResults) {
      if (err) {
        next(err);
      }
      else {
        req[pluralKey] = images;
        req.paging = {
          lastPage: Math.ceil(feedResults.length / limit) - 1
        };
        req.feedResults = feedResults;
        next();
      }
    });
  },
  getRemainingTags: function (req, res, next) {
    var intercept = req.domain.intercept.bind(req.domain);
    var images = [];

    if (req.feedResults) {
      // feed endpoint
      var allFeedImageIds = req.feedResults.map(pluck(1)); // imageId is pos 1
      getFilterChannels(allFeedImageIds);
    }
    else {
      // we need to get them ourselves for the image (popular) endpoint
      var channelIds = req.channel;

      Image.findByAllChannelIds(channelIds, { _id: 1 }, intercept(function (images) {
        var imageIds = images.map(pluck('_id'));
        getFilterChannels(imageIds);
      }));
    }

    function getFilterChannels (imageIds) {
      Channel.findChannelsOnImages(imageIds, intercept(function (channels) {
        req.filterTags = channels;
        next();
      }));
    }
  },
  respond: function (req, res, next) {
    var self = this;
    var model = req[this.key];
    if (model) {
      if (model.returnJSON) {
        model.returnJSON(req.domain.intercept(function (json) {
          req[self.key] = json;
          self.super.respond(req, res, next);
        }));
      }
      else {
        self.super.respond(req, res, next);
      }
    }
    else if (req[this.pluralKey]) {
      this.respondList(req, res, next);
    }
    else {
      this.checkFound(req, res, next);
    }
  },
  findPageInChannels: function (channelsKey) {
    return function (req, res, next) {
      var channelIds = keypather.get(req, channelsKey) || [];
      if (!channelIds.length) {
        req.query.findNoDocuments = true;
      }
      else {
        req.query.$and = channelIds.map(function (channelId) {
          return { 'tags.channel': channelId };
        });
      }
      images.findPage('query', { files: 0 })(req, res, next);
    };
  },
  respondList: function (req, res, next) {
    var self = this;
    var models = req[this.pluralKey];
    async.map(models, function (model, cb) {
      if (model.returnJSON) {
        model.returnJSON(cb);
      }
      else {
        cb(null, model);
      }
    },
    req.domain.intercept(function (models) {
      if (req.paging) {
        req[self.pluralKey] = {
          data: models,
          paging: req.paging
        };
      }
      else {
        req[self.pluralKey] = models;
      }
      self.super.respondList(req, res, next);
    }));
  },
  respondFeed: function (req, res, next) {
    var self = this;
    var models = req[this.pluralKey];
    async.map(models, function (model, cb) {
      if (model.returnJSON) {
        model.returnJSON(cb);
      }
      else {
        cb(null, model);
      }
    },
    req.domain.intercept(function (models) {
      if (req.paging) {
        req[self.pluralKey] = {
          data: models,
          channels: req.filterTags,
          paging: req.paging
        };
      }
      else {
        req[self.pluralKey] = models;
      }
      self.super.respondList(req, res, next);
    }));
  }
});
