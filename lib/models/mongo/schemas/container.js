'use strict';

var mongoose = require('mongoose');
var validators = require('../schemas/schema-validators').commonValidators;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var debug = require('debug')('runnable-api:container:model');

/** Containers that are running for this instance
 *  @property {array} contexts[]
 *  @property {ObjectId} contexts[].container Id of the container running
 *  @property {ObjectId} contexts[].context Id of the context from which the container was built
 *  @property {ObjectId} contexts[].version Id of the context-version that was build */
var ContainerSchema = module.exports = new Schema({

  /**
   * Name of the container.  This should be inherited from the Context
   */
  name: {
    type: String,
    validate: validators.alphaNumName({model: 'Container', literal: 'Name', passIfEmpty: true})
  },

  context: {
    type: ObjectId,
    required: 'Containers require a Context',
    validate: validators.objectId({model: 'Container', literal: 'Context'})
  },

  version: {
    type: ObjectId,
    required: 'Containers require a version',
    validate: validators.objectId({model: 'Container', literal: 'Version'})
  },
  /** Docker host ip
   *  @type {String} */
  dockerHost: {
    type: String,
    required: 'Containers require a Docker Host',
    validate: validators.dockerHost({model: 'Container'})
  },
  /** Docker container Id
   *  @type {String} */
  dockerContainer: {
    type: String,
    required: 'Containers require a Docker Container',
    validate: validators.dockerId({model: 'Container'})
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Container', literal: 'Created'})
  },
  // Number
  /** Docker container ports - follows docker's schema
   *  @type {Mixed} */
  ports: {
    type: Schema.Types.Mixed
  }
});

ContainerSchema.set('toJSON', { virtuals: true });

// ContainerSchema.post('init', function (doc) {
//  console.log('** CONTAINER *** %s has been initialized from the db', doc);
// });
ContainerSchema.pre('validate', function (next) {
  // Do validation here
  next();
});
ContainerSchema.post('validate', function (doc) {
  debug('** CONTAINER *** %s has been validated (but not saved yet)', doc);
});
ContainerSchema.post('save', function (doc) {
  debug('** CONTAINER *** %s has been saved', doc);
});
ContainerSchema.post('remove', function (doc) {
  debug('** CONTAINER *** %s has been removed', doc);
});
