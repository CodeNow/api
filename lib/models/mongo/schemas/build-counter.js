/**
 * @module lib/models/mongo/schemas/build-counter
 */
'use strict'

var mongoose = require('mongoose')

var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema

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
})
