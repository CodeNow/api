/**
 * Sendgrid Api Model
 *
 * Sendgrid allows us to send transactional emails to new, potential users.  This model helps build
 * the api request for both admin and normal user email invites.  All methods return promises, but
 * the inviteAdmin and inviteUser methods also take a cb
 */
'use strict'

var Promise = require('bluebird')
var log = require('middlewares/logger')(__filename).log
var noop = require('101/noop')
var put = require('101/put')

module.exports = SendGridModel

var INVITE_BODY = '%requester% has invited you to the %orgName% team on Runnable. Has %requester% not told you about Runnable yet?'
var INVITE_BODY_HTML = '%requester% has invited you to the %orgName% team on Runnable.' +
  '<br class="br">Has %requester% not told you about Runnable yet? ' +
  '<a href="http://runnable.com" target="_blank" style="color: #888;' +
  'font-family: &quot;Helvetica Neue&quot;,Arial,sans-serif;">Learn more</a>.'

function SendGridModel () {
  log.info({
    tx: true
  }, 'SendGridModel constructor')

  if (!process.env.SENDGRID_KEY) {
    log.info('stubbing intercom, no APP_ID')
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
 * @param recipient model containing at least the email address of the invited user
 * @param sessionUser Full sessionUser object
 * @param emailMessage Email message body from the UI
 * @param cb (optional) callback
 * @returns {*|Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteAdmin = function (recipient, sessionUser, emailMessage, cb) {
  this.logData = put({
    recipient: recipient,
    sessionUser: sessionUser,
    emailMessage: emailMessage
  }, this.logData)

  log.info(this.logData, 'SendGridModel.prototype.inviteAdmin')

  var self = this
  cb = cb || noop
  return self.sendEmail({
    email: recipient.email,
    from: sessionUser.email,
    fromname: sessionUser.accounts.github.displayName,
    subject: sessionUser.accounts.github.displayName + ' has invited you to be an admin for a Runnable Team',
    body: emailMessage
  })
    .then(function () {
      cb()
    })
    .catch(function (err) {
      log.error(put({
        err: err
      }, self.logData), 'SendGridModel.prototype.inviteAdmin failure')
      cb(err)
    })
}

/**
 * Middleware to simplify sending a user invitation email through sendGrid.  User invitations are
 * more complex than admin emails, since they have substitutions and templates.  This method first
 * fetches more data on the org the invitation is for, since we may not be given it from the UI.
 * Chained after that is the actual email request.  Can take a cb, but returns a promise in case you
 * like that sort of thing.
 * @param recipient model containing at least the email address of the invited user
 * @param sessionUser Full sessionUser object
 * @param organizationId Github id of the organization extending the invitation
 * @param cb (optional) callback
 * @returns {*|Promise} resolves when email request is done
 */
SendGridModel.prototype.inviteUser = function (recipient, sessionUser, organizationId, cb) {
  this.logData = put({
    recipient: recipient,
    sessionUser: sessionUser,
    organizationId: organizationId
  }, this.logData)

  log.info(this.logData, 'SendGridModel.prototype.inviteUser')

  var self = this
  cb = cb || noop
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
      log.error(put({
        err: err
      }, self.logData), 'SendGridModel.prototype.inviteUser failure')
      cb(err)
    })
}

/**
 * Internal method to actually send an email.  This method takes in an object with properties
 * similar to the sendgrid Email object constructor arguments.  This looks for substitutions and
 * templates, and adds them to the Email object correctly.
 * @param emailOptions {
 *  to: recipient email address
 *  from: sender email address
 *  fromname: sender name that will appear in the from of the email
 *  subject: email subject
 *  body: text only content of the email
 *  htmlBody: html-version of the content. This must be sent, or the email will not include any html
 *  template: string id of the template
 *  substitutions: map of substitutions keyed with the variable to be substituted
 * }
 * @returns {*} a promise containing the actual email request
 */
SendGridModel.prototype.sendEmail = function (emailOptions) {
  log.info(put({
    emailOptions: emailOptions
  }, this.logData), 'SendGridModel.prototype.sendEmail')

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
