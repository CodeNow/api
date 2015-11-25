'use strict'

var Promise = require('bluebird')
var logger = require('middlewares/logger')(__filename)

module.exports = SendGridModel

var INVITE_BODY = 'Super awesome user %requester% thinks you should join Runnable!'
var ADMIN_BODY = 'You\'re such an awesome admin, %firstname%'

function SendGridModel () {
  logger.log.info({
    tx: true
  }, 'SendGridModel constructor')

  if (!process.env.SENDGRID_KEY) {
    logger.log.info('stubbing intercom, no APP_ID')
    return
  }

  this._sendgrid = require('sendgrid')(process.env.SENDGRID_KEY)
  this._sendgrid.sendAsync = Promise.promisify(this._sendgrid.send)
}

SendGridModel.prototype.inviteAdmin = function (recipient, sessionUser, organizationId, cb) {
  logger.log.info({
    tx: true,
    recipient: recipient,
    sessionUser: sessionUser,
    organizationId: organizationId
  }, 'SendGridModel.prototype.inviteAdmin')

  var self = this
  Promise.props({
    recipient: Promise.promisify(sessionUser.findGithubUserByGithubId, sessionUser)(recipient.github),
    organization: Promise.promisify(sessionUser.findGithubOrgByGithubId, sessionUser)(organizationId)
  })
    .then(function (data) {
      return self.sendEmail({
        email: recipient.email,
        subject: 'Check out Runnable!',
        body: ADMIN_BODY,
        template: 'ee14348c-1f56-47c3-af9e-d3d55d749494',
        substitutions: {
          '%email%': recipient.email, // This is the user-inputted value
          '%orgName%': data.organization.login,
          '%requester%': sessionUser.accounts.github.displayName,
          '%firstname%': data.recipient.name
        }
      })
    })
    .catch(function (err) {
      logger.log.error({
        tx: true,
        err: err,
        recipient: recipient,
        sessionUser: sessionUser,
        organizationId: organizationId
      }, 'SendGridModel.prototype.inviteAdmin failure')
      cb(err)
    })
}

SendGridModel.prototype.inviteUser = function (recipient, sessionUser, organizationId, cb) {
  logger.log.info({
    tx: true,
    recipient: recipient,
    sessionUser: sessionUser,
    organizationId: organizationId
  }, 'SendGridModel.prototype.inviteUser')

  var self = this
  Promise.props({
    recipient: Promise.promisify(sessionUser.findGithubUserByGithubId, sessionUser)(recipient.github),
    organization: Promise.promisify(sessionUser.findGithubOrgByGithubId, sessionUser)(organizationId)
  })
    .then(function (data) {
      console.log('recipientr', data.recipient)
      return self.sendEmail({
        email: recipient.email,
        subject: 'Check out Runnable!',
        body: INVITE_BODY,
        template: 'ee14348c-1f56-47c3-af9e-d3d55d749494',
        substitutions: {
          '%email%': recipient.email, // This is the user-inputted value
          '%orgName%': data.organization.login,
          '%requester%': sessionUser.accounts.github.displayName,
          '%firstname%': data.recipient.name
        }
      })
    })
    .then(function () {
      cb()
    })
    .catch(function (err) {
      logger.log.error({
        tx: true,
        err: err,
        recipient: recipient,
        sessionUser: sessionUser,
        organizationId: organizationId
      }, 'SendGridModel.prototype.inviteUser failure')
      cb(err)
    })
}

SendGridModel.prototype.sendEmail = function (emailOptions) {
  logger.log.info({
    tx: true,
    emailOptions: emailOptions
  }, 'SendGridModel.prototype.sendEmail')

  var email = new this._sendgrid.Email({
    to: emailOptions.email,
    from: 'invites@runnable.com',
    subject: emailOptions.subject,
    text: emailOptions.body,
    html: emailOptions.body // HTML needs to be here, otherwise only a text email is sent
  })
  if (emailOptions.substitutions) {
    Object.keys(emailOptions.substitutions).forEach(function (key) {
      email.addSubstitution(key, emailOptions.substitutions[key])
    })
  }

  if (emailOptions.template) {
    email.setFilters({
      'templates': {
        'settings': {
          'enable': 1,
          'template_id': emailOptions.template
        }
      }
    })
  }
  return this._sendgrid.sendAsync(email)
    .then(function (json) {
      console.log(json)
    })
}
