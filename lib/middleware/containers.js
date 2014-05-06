'use strict';

var async = require('async');
var Container = require('models/containers');
// var _ = require('lodash');
// var body = require('middleware/body');
// var harbourmaster = require('middleware/harbourmaster');
// var dockworker = require('middleware/dockworker');
// var images = require('middleware/images');
// var utils = require('middleware/utils');
// var flow = require('middleware-flow');

var createMongooseMiddleware = require('./createMongooseMiddleware');

module.exports = createMongooseMiddleware(Container, {
  // FIXME: what is this for!? we're setting the owner of the container?
  authChangeUpdateOwners: function (req, res, next) {
    this.update({
      owner: req.user_id
    }, {
      $set: {
        owner: req.me._id.toString()
      }
    })(req, res, next);
  },
  // publish: function (req, res, next) {
  //   var committingNew = (req.body.status === 'Committing new');
  //   flow.series(
  //     flow.if(!req.container.parent || committingNew)
  //       .then(containers.fullPublish)
  //       .else(
  //         images.findById('container.parent', { name: 1, description: 1, tags: 1, last_write: 1 }),
  //         flow.mwIf(containers.metaPublishCheck('image')) // metapublish check
  //           .then(containers.model.metaPublish('image'))
  //           .else(containers.fullPublish)),
  //     body.unset('status'))(req, res, next);
  // },
  // fullPublish: function (req, res, next) {
  //   flow.series(
  //     flow.if(req.query.dontBuild)
  //       .else(dockworker.runBuildCmd),
  //     body.trim('status'),
  //     containers.model.atomicUpdateCommitStatusAndName('body', 'me'),
  //     flow.mwIf(containers.checkFound) // atomic update uses findAndModify
  //       .then(harbourmaster.commitContainer('container')) // container updated successfull
  //       .else(containers.findById('params.containerId', { files: 0 })))(req, res, next);
  // },
  // metaPublishCheck: function (imageKey) {
  //   return function (req, res, next) {
  //     var image = utils.replacePlaceholders(req, imageKey);
  //     if (req.container.metaPublishCheck(image)) {
  //       next();
  //     }
  //     else {
  //       next(new Error('do a full publish'));
  //     }
  //   };
  // },
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
      req[self.pluralKey] = models;
      self.super.respondList(req, res, next);
    }));
  },
  // respondTag: function (req, res) {
  //   var channelId = req.channel._id;
  //   req.container.returnJSON(req.domain.intercept(function (containerJSON) {
  //     var channelTag = _.findWhere(containerJSON.tags, function (tag) {
  //       return utils.equalObjectIds(tag.channel, channelId);
  //     });
  //     res.json(201, channelTag);
  //   }));
  // }
});
