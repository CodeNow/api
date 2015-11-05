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
    validate: validators.beforeNow({model: 'TeammateInvitation', literal: 'created'})
  },
  /**  @type: string */
  githubUsername: {
    type: String,
    index: true,
    required: 'A GitHub name of the user is required for an invitation'
  },
  /**  @type: string */
  email: {
    type: String,
    required: 'Invitation require an Email Address to be sent to',
    validate: validators.email({model: 'TeammateInvitation', literal: 'Email'})
  },
  author : {
    type: ObjectId,
    ref: 'User',
    required: 'The user who created the invitation is required',
    validate: validators.objectId({model: 'TeammateInvitation', literal: 'User'})
  },
  orgName: {
    type: String,
    index: true,
    required: 'GitHub org name in which the invitation was send is required',
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
TeammateInvitation.post('save', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'TeammateInvitation saved');
});
TeammateInvitation.post('remove', function (doc) {
  log.trace({
    tx: true,
    doc: doc
  }, 'TeammateInvitation removed');
});
