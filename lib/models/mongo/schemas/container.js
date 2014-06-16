'use strict';

var mongoose = require('mongoose');
var configs = require('configs');
var BaseSchema = require('models/mongo/schemas/base');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/** Containers that are running for this instance
 *  @property {array} contexts[]
 *  @property {ObjectId} contexts[].container Id of the container running
 *  @property {ObjectId} contexts[].context Id of the context from which the container was built
 *  @property {ObjectId} contexts[].version Id of the context-version that was build */
var ContainerSchema = module.exports = new Schema({
  name: { type: String }, // should be inherited from context
  context: { type: ObjectId },
  version: { type: ObjectId },
  /** Docker host ip
   *  @type {String} */
  dockerHost: {
    type: String
  },
  /** Docker container Id
   *  @type {String} */
  dockerContainer: { type: String },
  /** @type date */
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
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