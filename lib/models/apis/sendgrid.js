'use strict'

var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var log = require('middlewares/logger')(__filename).log
var noop = require('101/noop')
var put = require('101/put')
/**
 * Sendgrid Api Model
 *
 * Sendgrid allows us to send transactional emails to new, potential users.  This model helps build
 * the api request for both admin and normal user email invites.  All methods return promises, but
 * the inviteAdmin and inviteUser methods also take a cb
 */
module.exports = SendGridModel

var INVITE_BODY = '%requester% has invited you to the %orgName% team on Runnable. Has %requester% not told you about Runnable yet?'
var INVITE_BODY_HTML = '%requester% has invited you to the %orgName% team on Runnable.' +
  '<br class="br">Has %requester% not told you about Runnable yet? ' +
  '<a href="http://runnable.com" target="_blank" style="color: #888;' +
  'font-family: &quot;Helvetica Neue&quot;,Arial,sans-serif;">Learn more</a>.'

function SendGridModel () {
  log.trace({
    tx: true
  }, 'SendGridModel constructor')

  if (!process.env.SENDGRID_KEY) {
    log.error('SENDGRID: stubbing intercom, no APP_ID')
    return
  }
  if (!process.env.SENDGRID_USER_INVITE_TEMPLATE) {
    log.error('SENDGRID: no user invite template id given')
    return
  }

  this._sendgrid = require('sendgrid')(process.env.SENDGRID_KEY)
  this._sendgrid.sendAsync = Promise.promisify(this._sendgrid.send)
  this.logData = {
    tx: true
  }
}

/**
 * Easy helper to grab only the first name of someone's display name
 * @param fullName
 * @returns {*}
 */
function getFirstName (fullName) {
  return fullName.split(' ')[0]
}

/**
 * Middleware to easily make and send an admin invitation email through sendGrid.  Admin emails are
 * just plain text, so this is much simpler than the regular invite.  Substitutions are manually
 * done here, instead of using the sendGrid subs.  Can take a cb, but returns a promise in case you
 * like that sort of thing.
 * @param recipient {object} model containing at least the email address of the invited user
 * @param recipient.email {string} email address of the recipient.  User input
 * @param sessionUser {string} Full sessionUser object
 * @param emailMessage {string} Email message body from the UI
 * @returns {Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteAdmin = function (recipient, sessionUser, emailMessage) {
  this.logData = put({
    recipient: recipient,
    sessionUser: sessionUser.accounts.github.displayName,
    emailMessage: emailMessage
  }, this.logData)

  log.trace(this.logData, 'SendGridModel.prototype.inviteAdmin')

  return this.sendEmail({
    email: 'asdfasdfadsf',
    from: sessionUser.email,
    fromname: sessionUser.accounts.github.displayName,
    subject: '%requester% has invited you to be an admin for a Runnable Team',
    body: null,
    substitutions: {
      '%requester%': getFirstName(sessionUser.accounts.github.displayName)
    }
  }).bind(this)
    .catch(function (err) {
      log.error(put({
        err: err
      }, this.logData), 'SendGridModel.prototype.inviteAdmin failure')
      throw err
    })
}

/**
 * Middleware to simplify sending a user invitation email through sendGrid.  User invitations are
 * more complex than admin emails, since they have substitutions and templates.  This method first
 * fetches more data on the org the invitation is for, since we may not be given it from the UI.
 * Chained after that is the actual email request.  Can take a cb, but returns a promise in case you
 * like that sort of thing.
 * @param recipient {object} model containing at least the email address of the invited user
 * @param recipient.email {string} email address of the recipient.  User input
 * @param sessionUser {string} Full sessionUser object
 * @param organizationId {number} Github id of the organization extending the invitation
 * @returns {Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteUser = function (recipient, sessionUser, organizationId) {
  this.logData = put({
    recipient: recipient,
    sessionUser: sessionUser.accounts.github.displayName,
    organizationId: organizationId
  }, this.logData)

  log.trace(this.logData, 'SendGridModel.prototype.inviteUser')

  var findGithubOrgByGithubIdAsync = Promise.promisify(sessionUser.findGithubOrgByGithubId, sessionUser)
  return findGithubOrgByGithubIdAsync(organizationId).bind(this)
    .then(function (organization) {
      return this.sendEmail({
        email: recipient.email,
        from: 'invites@runnable.com',
        fromname: 'Runnable Invites',
        subject: '%requester% has invited you to Runnable',
        body: INVITE_BODY,
        htmlBody: INVITE_BODY_HTML,
        template: process.env.SENDGRID_USER_INVITE_TEMPLATE,
        substitutions: {
          '%email%': recipient.email, // This is the user-inputted value
          '%orgName%': organization.login,
          '%requester%': getFirstName(sessionUser.accounts.github.displayName)
        }
      })
    })
    .catch(function (err) {
      log.error(put({
        err: err
      }, this.logData), 'SendGridModel.prototype.inviteUser failure')
      throw err
    })
}

/**
 * Internal method to actually send an email.  This method takes in an object with properties
 * similar to the sendgrid Email object constructor arguments.  This looks for substitutions and
 * templates, and adds them to the Email object correctly.
 * @param emailOptions
 * @param emailOptions.to {string} recipient email address
 * @param emailOptions.from {string} sender email address
 * @param emailOptions.fromname {string} sender name that will appear in the from of the email
 * @param emailOptions.subject {string} email subject
 * @param emailOptions.body {string} text only content of the email
 * @param emailOptions.htmlBody {string} html-version of the content. This must be sent, or the email will not include any html
 * @param emailOptions.template {string} string id of the template
 * @param emailOptions.substitutions {object} map of substitutions keyed with the variable to be substituted
 * @returns {Promise} a promise containing the actual email request
 */
SendGridModel.prototype.sendEmail = function (emailOptions) {
  log.trace(put({
    emailOptions: emailOptions
  }, this.logData), 'SendGridModel.prototype.sendEmail')

  if (!this._sendgrid) {
    // If sendGrid was never initialized, then return a failed promise
    log.error(put({
      emailOptions: emailOptions
    }, this.logData), 'SendGridModel.prototype.sendEmail missing api key')
    return Promise.reject(new Error('SendGrid model is missing a valid api key'))
  }

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
  return this._sendgrid.sendAsync(email).bind(this)
    .catch(function (err) {
      log.error(put({
        err: err
      }, this.logData), 'SendGridModel.prototype.sendEmail failure')
      if (err.isOperational) {
        throw err.message
      } else {
        throw Boom.badGateway(err.message)
      }
    })
}
