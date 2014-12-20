'use strict';

/**
 * Contexts represent a single Docker build context, which can be associated with both
 * images and containers.
 * @module models/context
 */

var debug = require('debug')('runnable-api:context:model');
var mongoose = require('mongoose');
var Boom = require('dat-middleware').Boom;
var pluck = require('101/pluck');
var pick = require('101/pick');
var uuid = require('uuid');

var ContextSchema = require('models/mongo/schemas/context');

/** Check to see if a context is public.
 *  @param {function} [cb] function (err, {@link module:models/context Context}) */
ContextSchema.methods.isPublic = function (cb) {
  debug('checking to see if context is public: ' + this.public);
  var err;
  if (!this.public) {
    err = Boom.forbidden('Context is private');
  }
  cb(err, this);
};

ContextSchema.statics.createBy = function (props, cb) {
  var context = new Context(props);
  context.set({
    owner: props.owner
  });
  cb(null, context);
};

ContextSchema.statics.copyByIdForNewOwner = function (contextId, owner, cb) {
  this.findById(contextId, function (err, context) {
    if (err) {
      cb(err);
    }
    var newContext = new Context(pick(context, ['description']));
    newContext.set({
      owner: {
        github: owner.accounts.github.id
      },
      name: uuid()
    });
    newContext.save(function (err) {
      cb(err, newContext);
    });
  });
};

ContextSchema.statics.findByVersions = function (contextVersions, cb) {
  var contextIds = contextVersions.map(pluck('context'));
  this.findByIds(contextIds, cb);
};

var Context = module.exports = mongoose.model('Contexts', ContextSchema);
