/**
 * @module lib/models/mongo/teammateInvitation
 */
'use strict';

var mongoose = require('mongoose');

var TeammateInvitationSchema = require('models/mongo/schemas/teammate-invitation');
var logger = require('middlewares/logger')(__filename);

var TeammateInvitation;
var log = logger.log;

TeammateInvitationSchema.statics.findByGithubOrgName = function (orgName, cb) {
  log.trace({
    tx: true,
    orgName: orgName,
  }, 'findByGithubOrgName');
  this.find({ 'orgName': orgName }, cb);
};

TeammateInvitation = mongoose.model('TeammateInvitation', TeammateInvitationSchema);
module.exports = TeammateInvitation;
