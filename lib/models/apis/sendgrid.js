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

var keypather = require('keypather')()
var logger = require('middlewares/logger')(__filename)

module.exports = SendGridModel

var INVITE_MESSAGES = {
  en: {
    admin: {
      subject: '%requester% has invited you to be an admin for a Runnable Team'
    },
    user: {
      subject: '%requester% has invited you to Runnable',
      body: '%requester% from %orgName% has invited you to Runnable. Has %requester% not told you about Runnable yet?',
      html: '%requester% from %orgName% has invited you to Runnable.' +
      '<br class="br">Has %requester% not told you about Runnable yet? ' +
      '<a href="http://runnable.com" target="_blank" style="color: #888;' +
      'font-family: &quot;Helvetica Neue&quot;,Arial,sans-serif;">Learn more</a>.'
    }
  }
}

function SendGridModel () {
  this.log = logger.log.child({
    tx: true
  })
  this.log.trace('SendGridModel constructor')
  var error
  if (!process.env.SENDGRID_KEY) {
    error = new Error('SENDGRID: stubbing sendgrid, no SENDGRID_KEY')
    this.log.fatal(error)
    throw error
  }
  if (!process.env.SENDGRID_USER_INVITE_TEMPLATE) {
    error = new Error('SENDGRID: no user invite template id given, missing SENDGRID_USER_INVITE_TEMPLATE')
    this.log.fatal(error)
    throw error
  }
  if (!process.env.SENDGRID_USER_INVITE_SENDER_NAME) {
    error = new Error('SENDGRID: no user invite sender name given, missing SENDGRID_USER_INVITE_SENDER_NAME')
    this.log.fatal(error)
    throw error
  }
  if (!process.env.SENDGRID_USER_INVITE_SENDER_EMAIL) {
    error = new Error('SENDGRID: no user invite sender email given, missing SENDGRID_USER_INVITE_SENDER_EMAIL')
    this.log.fatal(error)
    throw error
  }
  this._sendgrid = sendGrid(process.env.SENDGRID_KEY)
  this._sendgrid.sendAsync = Promise.promisify(this._sendgrid.send)
}

/**
 * Easy helper to grab only the first name of someone's display name
 * @param {String} fullName
 * @returns {String} The first name before the space of the user
 */
function getFirstName (fullName) {
  return (typeof fullName === 'string') ? fullName.split(/\s+/)[0] : null
}

/**
 * Fetches the real name of the user sending out an invite
 * @param   {User} sessionUser - user sending the invite
 * @returns {String} The real name of the user, or the username if we can't get that.  If we don't
 *                   have that either, it just returns 'A Runnable User you know'
 */
function getDisplayNameFromSessionUser (sessionUser) {
  return keypather.get(sessionUser, 'accounts.github._json.name') ||
    keypather.get(sessionUser, 'accounts.github.displayName') ||
    keypather.get(sessionUser, 'accounts.github.username')
}

/**
 * Helper to easily make and send an admin invitation email through sendGrid.  Admin emails are
 * just plain text, so this is much simpler than the regular invite.  Substitutions are manually
 * done here, instead of using the sendGrid subs.  Can take a cb, but returns a promise in case you
 * like that sort of thing.
 * @param {Object} recipient - model containing at least the email address of the invited user
 * @param {String} recipient.email - email address of the recipient.  User input
 * @param {User} sessionUser - Full sessionUser object
 * @param {String} emailMessage - Email message body from the UI
 * @returns {Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteAdmin = function (recipient, sessionUser, emailMessage) {
  var log = this.log
  log.info({
    recipient: recipient,
    sessionUser: sessionUser.accounts.github,
    emailMessage: emailMessage
  }, 'SendGridModel.prototype.inviteAdmin')

  var senderName = getDisplayNameFromSessionUser(sessionUser)
  return this.sendEmail({
    email: recipient.email,
    from: sessionUser.email,
    fromname: senderName,
    subject: INVITE_MESSAGES.en.admin.subject,
    body: emailMessage,
    substitutions: {
      '%requester%': getFirstName(senderName)
    }
  })
    .catch(function (err) {
      log.error({
        err: err
      }, 'inviteAdmin failure')
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
 * @param {User} sessionUser - Full sessionUser object
 * @param {Number|String} organizationId - Github id of the organization extending the invitation
 * @returns {Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteUser = function (recipient, sessionUser, organizationId) {
  var log = this.log
  log.info({
    recipient: recipient,
    sessionUser: sessionUser.accounts.github,
    organizationId: organizationId
  }, 'SendGridModel.prototype.inviteUser')

  var senderName = getDisplayNameFromSessionUser(sessionUser)
  var findGithubOrgByGithubIdAsync = Promise.promisify(sessionUser.findGithubOrgByGithubId, {context: sessionUser})
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
          '%requester%': getFirstName(senderName)
        }
      })
    })
    .catch(function (err) {
      log.error({
        err: err
      }, 'inviteUser failure')
      throw err
    })
}

/**
 * Internal method to actually send an email.  This method takes in an object with properties
 * similar to the sendgrid Email object constructor arguments.  This looks for substitutions and
 * templates, and adds them to the Email object correctly.
 * @param {Object} emailOptions
 * @param {String} emailOptions.email - recipient email address
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
  var log = this.log
  log.info({
    emailOptions: emailOptions
  }, 'SendGridModel.prototype.sendEmail')

  if (!this._sendgrid) {
    // If sendGrid was never initialized, then return a failed promise
    var missingApiKeyError = new Error('SendGridModel model is missing a valid api key')
    log.error({
      err: missingApiKeyError
    }, 'sendEmail missing api key')
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
      if (emailOptions.substitutions[key] !== null) {
        email.addSubstitution(key, emailOptions.substitutions[key])
      }
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
      log.error({
        err: err
      }, 'sendEmail failure')
      if (err.isOperational) {
        // If the err has this sendGrid specific 'isOperational' flag, bubble it up to the user
        throw err
      } else {
        // Otherwise wrap it in a boom
        throw Boom.badGateway(err.message)
      }
    })
}
