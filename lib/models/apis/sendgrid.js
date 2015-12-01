'use strict'

var Promise = require('bluebird')
var logger = require('middlewares/logger')(__filename)

module.exports = SendGridModel

var INVITE_BODY = '%requester% has invited you to the %orgName% team on Runnable. Has %requester% not told you about Runnable yet?'
var INVITE_BODY_HTML = '%requester% has invited you to the %orgName% team on Runnable.' +
  '<br class="br">Has %requester% not told you about Runnable yet? ' +
  '<a href="http://runnable.com" target="_blank" style="color: #888;' +
  'font-family: &quot;Helvetica Neue&quot;,Arial,sans-serif;">Learn more</a>.'

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

function getFirstName (fullName) {
  return fullName.split(' ')[0]
}

SendGridModel.prototype.inviteAdmin = function (recipient, sessionUser, emailMessage, cb) {
  logger.log.info({
    tx: true,
    recipient: recipient,
    sessionUser: sessionUser
  }, 'SendGridModel.prototype.inviteAdmin')

  var self = this
  return self.sendEmail({
    email: recipient.email,
    from: sessionUser.accounts.github.email,
    fromname: sessionUser.accounts.github.displayName,
    subject: sessionUser.accounts.github.displayName + ' has invited you to be an admin for a Runnable Team',
    body: emailMessage
  })
    .then(function () {
      cb()
    })
    .catch(function (err) {
      logger.log.error({
        tx: true,
        err: err,
        recipient: recipient,
        sessionUser: sessionUser
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
  return Promise.promisify(sessionUser.findGithubOrgByGithubId, sessionUser)(organizationId)
    .then(function (organization) {
      return self.sendEmail({
        email: recipient.email,
        from: 'invites@runnable.com',
        fromname: 'Runnable Invites',
        subject: '%requester% has invited you to Runnable',
        body: INVITE_BODY,
        htmlBody: INVITE_BODY_HTML,
        template: 'ee14348c-1f56-47c3-af9e-d3d55d749494',
        substitutions: {
          '%email%': recipient.email, // This is the user-inputted value
          '%orgName%': organization.login,
          '%requester%': getFirstName(sessionUser.accounts.github.displayName)
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
    from: emailOptions.from,
    fromname: emailOptions.fromname,
    subject: emailOptions.subject,
    text: emailOptions.body,
    html: emailOptions.htmlBody // HTML needs to be here, otherwise only a text email is sent
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
}
