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

module.exports = mongoose.model('Contexts', ContextSchema);
