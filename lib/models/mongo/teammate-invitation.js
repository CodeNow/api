/**
 * @module lib/models/mongo/teammateInvitation
 */
'use strict';

var mongoose = require('mongoose');

var TeammateInvitationSchema = require('models/mongo/schemas/teammate-invitation');
var logger = require('middlewares/logger')(__filename);

var TeammateInvitation;
var log = logger.log;

TeammateInvitationSchema.statics.findByGithubOrg = function (orgGithubID, cb) {
  log.trace({
    tx: true,
    orgGithubID: orgGithubID,
  }, 'findByGithubOrg');
  this.find({ 'organization.github': orgGithubID }, cb);
};

TeammateInvitation = mongoose.model('TeammateInvitation', TeammateInvitationSchema);
module.exports = TeammateInvitation;
