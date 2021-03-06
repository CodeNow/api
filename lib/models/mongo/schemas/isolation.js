/**
 * @module lib/models/mongo/schemas/isolation
 */
'use strict'

var Boom = require('dat-middleware').Boom
var keypather = require('keypather')()
var Schema = require('mongoose').Schema

var IsolationSchema = module.exports = new Schema({
  owner: {
    required: 'Isolation requires an owner',
    type: {
      github: {
        type: Number
      }
    }
  },
  createdBy: {
    required: 'Isolation requires createdBy',
    type: {
      github: {
        type: Number
      }
    }
  },
  state: {
    type: String,
    enum: ['killing', 'killed', 'redeploying']
  },
  // if we recieve image-builder-container-die event
  // trigger redeploy for all children in the same isolation
  redeployOnKilled: {
    type: Boolean
  }
})

IsolationSchema.pre('save', function (next) {
  var err
  if (!keypather.get(this, 'owner.github')) {
    err = Boom.badRequest("Instance's owner githubId is required")
    err.name = 'ValidationError'
  } else if (!keypather.get(this, 'createdBy.github')) {
    err = Boom.badRequest("Instance's createdBy githubId is required")
    err.name = 'ValidationError'
  } else if (isNaN(this.owner.github)) {
    err = Boom.badRequest("Instance's owner githubId must be a number")
    err.name = 'ValidationError'
  } else if (isNaN(this.createdBy.github)) {
    err = Boom.badRequest("Instance's createdBy githubId must be a number")
    err.name = 'ValidationError'
  }
  next(err)
})
