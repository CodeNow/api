var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var fstream = require('fstream');
var os = require('os');
var uuid = require('node-uuid');
var error = require('error');
var rimraf = require('rimraf');
var redis = require('models/redis');
var cacheImagesFeeds = require('models/redis/cacheImageFeeds');
var Image = require('models/images');
var Channel = require('models/channels');
var tar = require('tar');
var zlib = require('zlib');
var request = require('request');
var configs = require('configs');
var utils = require('middleware/utils');
var keypather = require('keypather')();
var mutils = require('map-utils');
var createModelMiddleware = require('./createModelMiddleware');
var series = utils.series;
var pluck = require('map-utils').pluck;

var ImageFeed = require('models/feeds/ImageFeed');
var ImageFeedsIntersection = require('models/feeds/ImageFeedsIntersection');


var images = module.exports = createModelMiddleware(Image, {
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
      var channelIds = req.channels.map(pluck('_id'));

      Image.findByAllChannelIds(channelIds, { _id: 1 }, intercept(function (images) {
        var imageIds = images.map(pluck('_id'));
        getFilterChannels(imageIds);
      }));
    }

    function getFilterChannels (imageIds) {
      Channel.findChannelsOnImages(allFeedImageIds, intercept(function (channels) {
        req.filterTags = channels;
        next();
      }));
    }
  },
  protectTmpDir: function (err, req, res, next) {
    console.error('pro', err);
    if (req.tmpdir) {
      rimraf(req.tmpdir, function (e) {
        next(e || err);
      });
    } else {
      next(err);
    }
  },
  writeTarGz: function (req, res, next) {
    req.tmpdir = '' + os.tmpdir() + '/' + uuid.v4();
    fs.mkdir(req.tmpdir, req.domain.intercept(function () {
      req
        .pipe(zlib.createUnzip())
        .pipe(tar.Parse())
        .pipe(fstream.Writer({ path: req.tmpdir }))
          .on('close', next);
    }));
  },
  findDockerfile: function (req, res, next) {
    fs.exists(req.tmpdir + '/Dockerfile', function (exists) {
      if (exists) {
        req.dockerdir = req.tmpdir;
        next();
      } else {
        fs.readdir(req.tmpdir, req.domain.intercept(function (files) {
          req.dockerdir = req.tmpdir + '/' + files[0];
          fs.exists(req.dockerdir + '/Dockerfile', function (exists) {
            if (!exists) {
              next(error(400, 'could not find Dockerfile'));
            } else {
              next();
            }
          });
        }));
      }
    });
  },
  loadDockerfile: function (req, res, next) {
    fs.readFile(req.dockerdir + '/Dockerfile', 'utf8', req.domain.intercept(function (dockerfile) {
      req.dockerfile = dockerfile;
      next();
    }));
  },
  parseDockerFile: function (req, res, next) {
    req.cmd = /^CMD\s+(.+)$/m.exec(req.dockerfile);
    if (req.cmd == null) {
      return next(error(400, 'Dockerfile needs CMD'));
    }
    req.cmd = req.cmd.pop();
    try {
      req.cmd = JSON.parse(req.cmd).join(' ');
    } catch (e) {}
    req.workdir = /^WORKDIR\s+(.+)$/m.exec(req.dockerfile);
    if (req.workdir == null) {
      return next(error(400, 'Dockerfile needs WORKDIR'));
    }
    req.workdir = req.workdir.pop();
    next();
  },
  readTempFiles: function (req, res, next) {
    // for now just covering our test usecase
    fs.readdir(req.dockerdir + '/src', req.domain.intercept(function (filenames) {
      async.map(filenames, function readFile (filename, cb) {
        fs.readFile(req.dockerdir + '/src/' + filename, 'utf8',
          req.domain.intercept(function (file) {
            cb(null, {
              name: filename,
              path: '/',
              dir: false,
              default: true,
              content: file,
              ignore: false
            });
          }));
      }, req.domain.intercept(function (files) {
        req.image.files = files;
        next();
      }));
    }));
  },
  buildDockerImage: function (req, res, next) {
    fstream.Reader({
      path: req.dockerdir + '/',
      type: 'Directory',
      mode: '0755'
    }).pipe(tar.Pack({
      fromBase: true
    }))
      .pipe(zlib.createGzip())
      .pipe(request.post({
        url: configs.harbourmaster + '/build',
        headers: { 'content-type': 'application/x-gzip' },
        qs: {
          t: configs.dockerRegistry +
          '/runnable/' +
          req.image._id.toString()
        },
        pool: false
      }, req.domain.intercept(function (resp, body) {
        if (resp.statusCode !== 200) {
          next(error(resp.statusCode, body));
        } else if (body.indexOf('Successfully built') === -1) {
          next(error(400, body));
        } else {
          req.image.revisions.push({
            repo: req.image._id.toString()
          });
          next();
        }
      })));
  },
  cleanTmpDir: function (req, res, next) {
    rimraf(req.tmpdir, next);
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
