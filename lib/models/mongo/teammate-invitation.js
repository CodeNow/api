/**
 * @module lib/models/mongo/teammateInvitation
 */
'use strict'

var mongoose = require('mongoose')

var TeammateInvitationSchema = require('models/mongo/schemas/teammate-invitation')
var logger = require('middlewares/logger')(__filename)

var TeammateInvitation
var log = logger.log

TeammateInvitationSchema.statics.findByGithubOrg = function (orgGithubId, cb) {
  log.info({
    tx: true,
    orgGithubId: orgGithubId
  }, 'findByGithubOrg')
  this.find({ 'organization.github': orgGithubId }, cb)
}

TeammateInvitation = mongoose.model('TeammateInvitation', TeammateInvitationSchema)
module.exports = TeammateInvitation
