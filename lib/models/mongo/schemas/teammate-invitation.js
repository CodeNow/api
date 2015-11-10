/**
 * @module lib/models/mongo/schemas/user
 */
'use strict';

var extend = require('extend');
var mongoose = require('mongoose');

var BaseSchema = require('models/mongo/schemas/base');
var logger = require('middlewares/logger')(__filename);
var validators = require('models/mongo/schemas/schema-validators').commonValidators;

var ObjectId = mongoose.Schema.ObjectId;
var Schema = mongoose.Schema;

var log = logger.log;

/** @alias module:models/user */
var TeammateInvitation = module.exports = new Schema({
  /** @type: date */
  created: {
    type: Date,
    'default': Date.now,
    validate: validators.beforeNow({model: 'User', literal: 'created'})
  },
  recipient: {
    github: {
      /**  @type: string */
      id : {
        type: Number,
        index: true,
        required: 'a github user id of the invited user is required for an invitation'
      },
    },
    /**  @type: string */
    email: {
      type: String,
      required: true,// 'Invitation require an Email Address to be sent to',
      validate: validators.email({model: 'TeammateInvitation', literal: 'email'})
    },
  },
  sender: {
    type: ObjectId,
    ref: 'User',
    required: 'The user who sent the invitation is required',
    validate: validators.objectId({model: 'TeammateInvitation', literal: 'User'})
  },
  organization: {
    github: {
      /**  @type: string */
      id : {
        type: Number,
        index: true,
        required: function () {
          return true;
        }, //'a github user id of the invited user is required for an invitation'
      }
    }
  }
});


extend(TeammateInvitation.methods, BaseSchema.methods);
extend(TeammateInvitation.statics, BaseSchema.statics);

TeammateInvitation.post('validate', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'TeammateInvitation validated not saved');
});
TeammateInvitation.post('remove', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'TeammateInvitation removed');
});
