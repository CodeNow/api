'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var debug = require('debug')('runnable-api:context:model');
var mongoose = require('mongoose');
var Boom = require('dat-middleware').Boom;

var join = require('path').join;

var ContextSchema = require('models/mongo/schemas/context');

/** Check to see if a project is public.
 *  @param {function} [cb] function (err, {@link module:models/project Project}) */
ContextSchema.methods.isPublic = function (cb) {
  debug('checking to see if context is public: ' + this.public);
  var err;
  if (!this.public) {
    err = Boom.forbidden('Context is private');
  }
  cb(err, this);
};

/** Look for a context by github repository
 *  @param {string} owner Github username
 *  @param {string} repositoryName Github repository name
 *  @param {function} cb function (err, {@link module:models/context Context}) */
ContextSchema.statics.findByRepository = function (owner, repositoryName, cb) {
  debug('looking for context by repo', owner, repositoryName);
  var githubRepo = join(owner, repositoryName);
  this
    .findOne({
      source: {
        $elemMatch: {
          sourceType: 'github',
          location: githubRepo
        }
      }
    })
    .exec(function (err, context) {
      debug('done looking for context', err);
      cb(err, context);
    });
};

module.exports = mongoose.model('Contexts', ContextSchema);
