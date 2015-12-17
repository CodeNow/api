/**
 * @module unit/models/apis/docker
 */
'use strict'
require('loadenv')()

var Code = require('code')
var Lab = require('lab')
var path = require('path')
var sinon = require('sinon')

var SendGridModel = require('models/apis/sendgrid')
var Promise = require('bluebird')
var lab = exports.lab = Lab.script()
var noop = require('101/noop')

var describe = lab.describe
var expect = Code.expect
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var it = lab.it
var moduleName = path.relative(process.cwd(), __filename)

function thisShouldNotBeCalled (cb) {
  return function () {
    cb(new Error('This shouldn\'t have been called'))
  }
}
describe('sendgrid: ' + moduleName, function () {
  var error
  var sendgrid
  var rejectionPromise
  var successPromise
  var sessionUserMe
  var sessionUserThem
  var recipient
  var githubOrgResponse = {
    login: 'AcmeCorp',
    id: '1234sfasdf'
  }
  beforeEach(function (done) {
    error = new Error('this is an error')
    rejectionPromise = Promise.reject(error)
    rejectionPromise.suppressUnhandledRejections()
    successPromise = Promise.resolve(true)
    done()
  })
  describe('testing all successfull functionality', function () {
    beforeEach(function (done) {
      sendgrid = new SendGridModel()
      sinon.stub(sendgrid._sendgrid, 'sendAsync')
      done()
    })
    afterEach(function (done) {
      sendgrid._sendgrid.sendAsync.restore()
      done()
    })

    describe('sendEmail', function () {
      describe('success', function () {
        beforeEach(function (done) {
          sendgrid._sendgrid.sendAsync.returns(successPromise)
          done()
        })
        it('should send emails with the given arguments', function (done) {
          var emailOpts = {
            email: 'hello',
            subject: 'asdasdasd',
            body: '11212312313',
            htmlBody: 'asdfasdfadsfadsf'
          }

          sendgrid.sendEmail(emailOpts)
            .then(function () {
              sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync)
              var emailObject = sendgrid._sendgrid.sendAsync.args[0][0]
              expect(emailObject.to, 'to').to.equal(emailOpts.email)
              expect(emailObject.subject, 'subject').to.equal(emailOpts.subject)
              expect(emailObject.text, 'text').to.equal(emailOpts.body)
              expect(emailObject.html, 'html').to.equal(emailOpts.htmlBody)
              done()
            })
            .catch(done)
        })

        it('should send an email with substitutions and a template', function (done) {
          var emailOpts = {
            email: 'hello',
            subject: 'asdasdasd',
            body: '11212312313',
            htmlBody: 'asdfasdfadsfadsf',
            substitutions: {
              'hello': 'chickenbutt'
            },
            template: 'asdasdasd'
          }

          sendgrid.sendEmail(emailOpts)
            .then(function () {
              sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync)
              var emailObject = sendgrid._sendgrid.sendAsync.args[0][0]
              expect(emailObject.to, 'to').to.equal(emailOpts.email)
              expect(emailObject.subject, 'subject').to.equal(emailOpts.subject)
              expect(emailObject.text, 'text').to.equal(emailOpts.body)
              expect(emailObject.html, 'html').to.equal(emailOpts.htmlBody)
              expect(emailObject.smtpapi.header.sub.hello, 'sub').to.deep.equal([emailOpts.substitutions.hello])
              expect(emailObject.smtpapi.header.filters, 'template').to.deep.equal({
                'templates': {
                  'settings': {
                    'enable': 1,
                    'template_id': emailOpts.template
                  }
                }
              })
              done()
            })
            .catch(done)
        })
      })
      describe('failure', function () {
        beforeEach(function (done) {
          sendgrid._sendgrid.sendAsync.returns(rejectionPromise)
          done()
        })
        it('should return the normal error when isOperational', function (done) {
          error.isOperational = true
          sendgrid.sendEmail({
            email: 'hello',
            subject: 'asdasdasd',
            body: '11212312313'
          })
            .catch(function (err) {
              expect(error).to.equal(err)
              sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync)
              done()
            })
            .catch(done)
        })

        it('should throw a Boom error when the failure !isOperational', function (done) {
          sendgrid.sendEmail({
            email: 'hello',
            subject: 'asdasdasd',
            body: '11212312313'
          })
            .catch(function (err) {
              expect(err).to.be.an.object()
              expect(err.isBoom).to.be.true()
              expect(err.output.payload.message).to.equal(error.message)
              expect(err.output.payload.error).to.equal('Bad Gateway')
              sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync)
              done()
            })
            .catch(done)
        })
      })
    })
    describe('invite helper functions', function () {
      beforeEach(function (done) {
        githubOrgResponse = {
          login: 'AcmeCorp',
          id: '1234sfasdf'
        }
        sessionUserMe = {
          accounts: {
            github: {
              displayName: 'nathan',
              id: 'sadfasf23r2q31234'
            }
          },
          findGithubOrgByGithubId: noop
        }
        sessionUserThem = {
          email: 'ted@something.com',
          accounts: {
            github: {
              displayName: 'ted',
              id: 'sadfasf23r2q31234'
            }
          }
        }
        recipient = {
          email: 'nathan@runnable.com',
          github: 'adsfasdfadsf'
        }
        sinon.stub(sessionUserMe, 'findGithubOrgByGithubId')
        sinon.stub(sendgrid, 'sendEmail')
        done()
      })
      afterEach(function (done) {
        sessionUserMe.findGithubOrgByGithubId.restore()
        sendgrid.sendEmail.restore()
        done()
      })
      describe('inviteUser (using sessionUserMe)', function () {
        it('should attempt to send emails with the given arguments', function (done) {
          sessionUserMe.findGithubOrgByGithubId.yieldsAsync(null, githubOrgResponse)
          sendgrid.sendEmail.returns(Promise.resolve(true))

          sendgrid.inviteUser(recipient, sessionUserMe, githubOrgResponse.id)
            .then(function () {
              sinon.assert.calledOnce(sessionUserMe.findGithubOrgByGithubId)
              sinon.assert.calledWith(sessionUserMe.findGithubOrgByGithubId, '1234sfasdf')
              sinon.assert.calledOnce(sendgrid.sendEmail)
              var sendEmailOptions = sendgrid.sendEmail.args[0][0]

              expect(sendEmailOptions.email, 'email').to.equal(recipient.email)
              expect(sendEmailOptions.from, 'from').to.equal('invites@runnable.com')
              expect(sendEmailOptions.fromname, 'fromname').to.equal('Runnable Invites')
              expect(sendEmailOptions.subject, 'subject').to.equal('%requester% has invited you to Runnable')
              expect(sendEmailOptions.body, 'body').to.contains('%requester% has invited you to the %orgName%')
              expect(sendEmailOptions.htmlBody, 'htmlBody').to.contains('%requester% has invited you to the %orgName%')
              expect(sendEmailOptions.htmlBody, 'htmlBody').to.contains('<br class="br">')
              expect(sendEmailOptions.template, 'template').to.be.a.string()
              expect(sendEmailOptions.substitutions, 'substitutions').to.be.an.object()
              expect(sendEmailOptions.substitutions['%email%'], '%email%').to.equal('nathan@runnable.com')
              expect(sendEmailOptions.substitutions['%orgName%'], '%orgName%').to.equal('AcmeCorp')
              expect(sendEmailOptions.substitutions['%requester%'], '%requester%').to.equal('nathan')
              done()
            })
            .catch(done)
        })
        describe('error handling', function () {
          it('should log the github error if one happens', function (done) {
            sessionUserMe.findGithubOrgByGithubId.yieldsAsync(error)
            sendgrid.sendEmail.returns(Promise.resolve(true))

            sendgrid.inviteUser(recipient, sessionUserMe, githubOrgResponse.id)
              .catch(function (err) {
                expect(err.message).to.equal(error.message)
                sinon.assert.calledOnce(sessionUserMe.findGithubOrgByGithubId)
                sinon.assert.calledWith(sessionUserMe.findGithubOrgByGithubId, '1234sfasdf')
                sinon.assert.notCalled(sendgrid.sendEmail)
                done()
              })
              .catch(done)
          })

          it('should log the error from SendGrid if there is one', function (done) {
            sessionUserMe.findGithubOrgByGithubId.yieldsAsync(null, githubOrgResponse)
            sendgrid.sendEmail.returns(rejectionPromise)

            sendgrid.inviteUser(recipient, sessionUserMe, githubOrgResponse.id)
              .catch(function (err) {
                expect(err.message).to.equal(error.message)
                sinon.assert.calledOnce(sessionUserMe.findGithubOrgByGithubId)
                sinon.assert.calledWith(sessionUserMe.findGithubOrgByGithubId, '1234sfasdf')
                sinon.assert.calledOnce(sendgrid.sendEmail)
                done()
              })
              .catch(done)
          })
        })
      })

      describe('inviteAdmin (using sessionUserThem)', function () {
        var message = 'hello'

        it('should attempt to send admin emails with the given arguments', function (done) {
          sendgrid.sendEmail.returns(Promise.resolve(true))

          sendgrid.inviteAdmin(recipient, sessionUserThem, message)
            .then(function () {
              sinon.assert.calledOnce(sendgrid.sendEmail)
              var sendEmailOptions = sendgrid.sendEmail.args[0][0]

              expect(sendEmailOptions.email, 'email').to.equal(recipient.email)
              expect(sendEmailOptions.from, 'from').to.equal('ted@something.com')
              expect(sendEmailOptions.fromname, 'fromname').to.equal('ted')
              expect(sendEmailOptions.subject, 'subject').to.equal('%requester% has invited you to be an admin for a Runnable Team')
              expect(sendEmailOptions.body, 'body').to.contains(message)
              expect(sendEmailOptions.template, 'template').to.be.undefined()
              expect(sendEmailOptions.substitutions, 'substitutions').to.be.an.object()
              expect(sendEmailOptions.substitutions['%requester%'], '%requester%').to.equal('ted')
              done()
            })
            .catch(done)
        })
        describe('error handling', function () {
          it('should log the error from SendGrid if there is one', function (done) {
            sendgrid.sendEmail.returns(rejectionPromise)

            sendgrid.inviteAdmin(recipient, sessionUserThem, message)
              .catch(function (err) {
                expect(err).to.equal(error)
                sinon.assert.calledOnce(sendgrid.sendEmail)
                done()
              })
              .catch(done)
          })
        })
      })
    })
  })
  describe('Testing the ENV requirement', function () {
    var SENDGRID_KEY_backup
    var SENDGRID_USER_INVITE_TEMPLATE_backup
    beforeEach(function (done) {
      SENDGRID_KEY_backup = process.env.SENDGRID_KEY
      SENDGRID_USER_INVITE_TEMPLATE_backup = process.env.SENDGRID_USER_INVITE_TEMPLATE
      done()
    })
    afterEach(function (done) {
      process.env.SENDGRID_KEY = SENDGRID_KEY_backup
      process.env.SENDGRID_USER_INVITE_TEMPLATE = SENDGRID_USER_INVITE_TEMPLATE_backup
      done()
    })
    it('should throw an exception if the key is missing', function (done) {
      process.env.SENDGRID_KEY = null
      expect(function () { sendgrid = new SendGridModel() }).to.throw('SENDGRID: stubbing sendgrid, no SENDGRID_KEY')
      done()
    })
    it('should throw an exception if the key is missing', function (done) {
      process.env.SENDGRID_USER_INVITE_TEMPLATE = null
      expect(function () { sendgrid = new SendGridModel() }).to.throw('SENDGRID: no user invite template id given, missing SENDGRID_USER_INVITE_TEMPLATE')
      done()
    })
  })
})
