/**
 * @module lib/models/mongo/schemas/instance-counter
 */
'use strict'

var mongoose = require('mongoose')
var Schema = mongoose.Schema

var InstanceCounterSchema = module.exports = new Schema({
  isGlobal: {
    type: Boolean,
    default: false
  },
  count: {
    type: Number
  },
  owner: {
    type: {
      github: {
        type: Number
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    }
  }
})

InstanceCounterSchema.index({
  isGlobal: 1,
  count: 1,
  'owner.github': 1
})
