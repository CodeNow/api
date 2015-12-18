/**
 * Sendgrid Api Model
 *
 * Sendgrid allows us to send transactional emails to new, potential users.  This model helps build
 * the api request for both admin and normal user email invites.  All methods return promises, but
 * the inviteAdmin and inviteUser methods also take a cb
 *
 * @module lib/models/apis/sendgrid
 */

'use strict'

var Boom = require('dat-middleware').Boom
var Promise = require('bluebird')
var sendGrid = require('sendgrid')

var log = require('middlewares/logger')(__filename).log
var put = require('101/put')

module.exports = SendGridModel

var INVITE_MESSAGES = {
  en: {
    admin: {
      subject: '%requester% has invited you to be an admin for a Runnable Team'
    },
    user: {
      subject: '%requester% has invited you to Runnable',
      body: '%requester% has invited you to the %orgName% team on Runnable. Has %requester% not told you about Runnable yet?',
      html: '%requester% has invited you to the %orgName% team on Runnable.' +
      '<br class="br">Has %requester% not told you about Runnable yet? ' +
      '<a href="http://runnable.com" target="_blank" style="color: #888;' +
      'font-family: &quot;Helvetica Neue&quot;,Arial,sans-serif;">Learn more</a>.'
    }
  }
}

function SendGridModel () {
  log.trace({
    tx: true
  }, 'SendGridModel constructor')
  var error
  if (!process.env.SENDGRID_KEY) {
    error = new Error('SENDGRID: stubbing sendgrid, no SENDGRID_KEY')
    log.fatal(error)
    throw error
  }
  if (!process.env.SENDGRID_USER_INVITE_TEMPLATE) {
    error = new Error('SENDGRID: no user invite template id given, missing SENDGRID_USER_INVITE_TEMPLATE')
    log.fatal(error)
    throw error
  }
  if (!process.env.SENDGRID_USER_INVITE_SENDER_NAME) {
    error = new Error('SENDGRID: no user invite sender name given, missing SENDGRID_USER_INVITE_SENDER_NAME')
    log.fatal(error)
    throw error
  }
  if (!process.env.SENDGRID_USER_INVITE_SENDER_EMAIL) {
    error = new Error('SENDGRID: no user invite sender email given, missing SENDGRID_USER_INVITE_SENDER_EMAIL')
    log.fatal(error)
    throw error
  }
  this._sendgrid = sendGrid(process.env.SENDGRID_KEY)
  this._sendgrid.sendAsync = Promise.promisify(this._sendgrid.send)
  this.logData = {
    tx: true
  }
}

/**
 * Easy helper to grab only the first name of someone's display name
 * @param {String} fullName
 * @returns {String} The first name before the space of the user
 */
function getFirstName (fullName) {
  return fullName.split(/\s+/)[0]
}

/**
 * Helper to easily make and send an admin invitation email through sendGrid.  Admin emails are
 * just plain text, so this is much simpler than the regular invite.  Substitutions are manually
 * done here, instead of using the sendGrid subs.  Can take a cb, but returns a promise in case you
 * like that sort of thing.
 * @param {Object} recipient - model containing at least the email address of the invited user
 * @param {String} recipient.email - email address of the recipient.  User input
 * @param {Object} sessionUser - Full sessionUser object
 * @param {String} emailMessage - Email message body from the UI
 * @returns {Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteAdmin = function (recipient, sessionUser, emailMessage) {
  var logData = put({
    recipient: recipient,
    sessionUser: sessionUser.accounts.github.displayName,
    emailMessage: emailMessage
  }, this.logData)

  log.info(logData, 'SendGridModel.prototype.inviteAdmin')

  return this.sendEmail({
    email: recipient.email,
    from: sessionUser.email,
    fromname: sessionUser.accounts.github.displayName,
    subject: INVITE_MESSAGES.en.admin.subject,
    body: emailMessage,
    substitutions: {
      '%requester%': getFirstName(sessionUser.accounts.github.displayName)
    }
  })
    .catch(function (err) {
      log.error(put({
        err: err
      }, logData), 'inviteAdmin failure')
      throw err
    })
}

/**
 * Helper to simplify sending a user invitation email through sendGrid.  User invitations are
 * more complex than admin emails, since they have substitutions and templates.  This method first
 * fetches more data on the org the invitation is for, since we may not be given it from the UI.
 * Chained after that is the actual email request.  Can take a cb, but returns a promise in case you
 * like that sort of thing.
 * @param {Object} recipient model - containing at least the email address of the invited user
 * @param {String} recipient.email - email address of the recipient.  User input
 * @param {Object} sessionUser - Full sessionUser object
 * @param {Number|String} organizationId - Github id of the organization extending the invitation
 * @returns {Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteUser = function (recipient, sessionUser, organizationId) {
  var logData = put({
    recipient: recipient,
    sessionUser: sessionUser.accounts.github.displayName,
    organizationId: organizationId
  }, this.logData)

  log.info(logData, 'SendGridModel.prototype.inviteUser')
  var findGithubOrgByGithubIdAsync = Promise.promisify(sessionUser.findGithubUserByGithubId, {context: sessionUser})
  return findGithubOrgByGithubIdAsync(organizationId)
    .bind(this)
    .then(function (organization) {
      return this.sendEmail({
        email: recipient.email,
        from: process.env.SENDGRID_USER_INVITE_SENDER_EMAIL,
        fromname: process.env.SENDGRID_USER_INVITE_SENDER_NAME,
        subject: INVITE_MESSAGES.en.user.subject,
        body: INVITE_MESSAGES.en.user.body,
        htmlBody: INVITE_MESSAGES.en.user.html,
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
      }, logData), 'inviteUser failure')
      throw err
    })
}

/**
 * Internal method to actually send an email.  This method takes in an object with properties
 * similar to the sendgrid Email object constructor arguments.  This looks for substitutions and
 * templates, and adds them to the Email object correctly.
 * @param {Object} emailOptions
 * @param {String} emailOptions.to - recipient email address
 * @param {String} emailOptions.from - sender email address
 * @param {String} emailOptions.fromname - sender name that will appear in the from of the email
 * @param {String} emailOptions.subject - email subject
 * @param {String} emailOptions.body - text only content of the email
 * @param {String} emailOptions.htmlBody - html-version of the content. This must be sent, or the email will not include any html
 * @param {String} emailOptions.template - string id of the template
 * @param {Object} emailOptions.substitutions - map of substitutions keyed with the variable to be substituted
 * @returns {Promise} a promise containing the actual email request
 */
SendGridModel.prototype.sendEmail = function (emailOptions) {
  var logData = put({
    emailOptions: emailOptions
  }, this.logData)

  log.info(logData, 'SendGridModel.prototype.sendEmail')

  if (!this._sendgrid) {
    // If sendGrid was never initialized, then return a failed promise
    var missingApiKeyError = new Error('SendGridModel model is missing a valid api key')
    log.error(put({
      err: missingApiKeyError
    }, logData), 'sendEmail missing api key')
    return Promise.reject(missingApiKeyError)
  }

  var email = new this._sendgrid.Email({
    to: emailOptions.email,
    from: emailOptions.from,
    fromname: emailOptions.fromname,
    subject: emailOptions.subject,
    text: emailOptions.body,
    html: emailOptions.htmlBody // HTML needs to be here, otherwise only a text email is sent
  })

  // If the email has substitution values, add them.  The keys should be surrounded by % like %key%
  if (emailOptions.substitutions) {
    Object.keys(emailOptions.substitutions).forEach(function (key) {
      email.addSubstitution(key, emailOptions.substitutions[key])
    })
  }

  // If the email has a template, add it.
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
  // Actually make the sendGrid api call
  return this._sendgrid.sendAsync(email)
    .catch(function (err) {
      log.error(put({
        err: err
      }, logData), 'sendEmail failure')
      if (err.isOperational) {
        // If the err has this sendGrid specific 'isOperational' flag, bubble it up to the user
        throw err
      } else {
        // Otherwise wrap it in a boom
        throw Boom.badGateway(err.message)
      }
    })
}
