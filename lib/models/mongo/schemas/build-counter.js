'use strict';

var mongoose = require('mongoose');
// var validators = require('../schemas/schema-validators').commonValidators;
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
// var debug = require('debug')('runnable-api:build-counter:schema');

/** Containers that are running for this instance
 *  @property {array} contexts[]
 *  @property {ObjectId} contexts[].container Id of the container running
 *  @property {ObjectId} contexts[].context Id of the context from which the container was built
 *  @property {ObjectId} contexts[].version Id of the context-version that was build */
module.exports = new Schema({
  environment: ObjectId,
  count: {
    type: Number
  }
});