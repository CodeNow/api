'use strict';

var mongoose = require('mongoose');
var configs = require('configs');
var validators = require('../schemas/schema-validators').commonValidators;
var validate = require('mongoose-validator').validate;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

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
    validate : validators.alphaNumName({model: "Container", literal: "Name", passIfEmpty: true})
  },

  context: {
    type: ObjectId,
    required: 'Containers require a Context',
    validate : validators.objectId({model: "Container", literal: "Context"})
  },

  version: {
    type: ObjectId,
    required: 'Containers require a version',
    validate : validators.objectId({model: "Container", literal: "Version"})
  },
  /** Docker host ip
   *  @type {String} */
  dockerHost: {
    type: String,
    required: 'Containers require a Docker Host',
    validate : validators.dockerHost({model: "Container"})
  },
  /** Docker container Id
   *  @type {String} */
  dockerContainer: {
    type: String,
    required: 'Containers require a Docker Container',
    validate : validators.dockerId({model: "Container"})
  },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  // Number
  /** Docker container ports - follows docker's schema
   *  @type {Mixed} */
  ports: {
    type: Schema.Types.Mixed
  }
});

ContainerSchema.set('toJSON', { virtuals: true });

ContainerSchema.virtual('urls').get(function () {
  var container = this;

  var exposedPorts = Object.keys(container.ports);
  if (!container.ports) {
    return [];
  }
  else {
    return exposedPorts.map(function (exposedPort) {
      var portNumber = exposedPort.split('/')[0];
      return [container._id, '-', portNumber, '.', configs.domain].join('');
    });
  }
});