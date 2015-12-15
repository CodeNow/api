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
var SendGridEmail = require('sendgrid/lib/email')

function thisShouldNotBeCalled (cb) {
  return function (err) {
    if (err && err.message) {
      cb(err)
    } else {
      cb(new Error('This shouldn\'t have been called'))
    }
  }
}
describe('sendgrid: ' + moduleName, function () {
  describe('sendEmail', function () {
    var sendgrid = new SendGridModel()
    var error

    beforeEach(function (done) {
      sendgrid = new SendGridModel()
      sendgrid._sendgrid = {
        sendAsync: noop,
        Email: SendGridEmail
      }
      sendgrid.logData = {}
      error = new Error('this is an error')
      done()
    })
    afterEach(function (done) {
      sendgrid._sendgrid.sendAsync.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(sendgrid._sendgrid, 'sendAsync').returns(Promise.resolve(true))
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
          .catch(thisShouldNotBeCalled(done))
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
          .catch(thisShouldNotBeCalled(done))
      })
    })

    describe('failure', function () {
      it('should return the normal error when isOperational', function (done) {
        error.isOperational = true
        sinon.stub(sendgrid._sendgrid, 'sendAsync').returns(Promise.reject(error))

        sendgrid.sendEmail({
          email: 'hello',
          subject: 'asdasdasd',
          body: '11212312313'
        })
          .then(thisShouldNotBeCalled(done))
          .catch(function (err) {
            sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync)
            expect(error).to.equal(err)
            done()
          })
          .catch(thisShouldNotBeCalled(done))
      })

      it('should throw a Boom error when the failure !isOperational', function (done) {
        sinon.stub(sendgrid._sendgrid, 'sendAsync').returns(Promise.reject(error))

        sendgrid.sendEmail({
          email: 'hello',
          subject: 'asdasdasd',
          body: '11212312313'
        })
          .then(thisShouldNotBeCalled(done))
          .catch(function (err) {
            sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync)
            expect(err.isBoom).to.be.true()
            expect(err.output.payload.message).to.equal(error.message)
            expect(err.output.payload.error).to.equal('Bad Gateway')

            done()
          })
          .catch(thisShouldNotBeCalled(done))
      })
    })
  })

  describe('inviteUser', function () {
    var sessionUser = {
      accounts: {
        github: {
          displayName: 'nathan',
          id: 'sadfasf23r2q31234'
        }
      },
      findGithubOrgByGithubId: noop
    }
    var recipient = {
      email: 'nathan@runnable.com',
      github: 'adsfasdfadsf'
    }
    var githubOrgResponse = {
      login: 'AcmeCorp',
      id: '1234sfasdf'
    }
    var error = new Error('This is an error')
    var sendgrid

    beforeEach(function (done) {
      sendgrid = new SendGridModel()
      sendgrid._sendgrid = {
        sendAsync: noop,
        Email: SendGridEmail
      }
      sendgrid.logData = {}
      done()
    })
    afterEach(function (done) {
      sessionUser.findGithubOrgByGithubId.restore()
      done()
    })
    it('should attempt to send emails with the given arguments', function (done) {
      sinon.stub(sessionUser, 'findGithubOrgByGithubId').yieldsAsync(null, githubOrgResponse)
      sinon.stub(sendgrid, 'sendEmail').returns(Promise.resolve(true))

      sendgrid.inviteUser(recipient, sessionUser, githubOrgResponse.id)
        .then(function () {
          sinon.assert.calledOnce(sessionUser.findGithubOrgByGithubId)
          sinon.assert.calledWith(sessionUser.findGithubOrgByGithubId, '1234sfasdf')
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
        .catch(thisShouldNotBeCalled(done))
    })

    it('should log the github error if one happens', function (done) {
      sinon.stub(sessionUser, 'findGithubOrgByGithubId').yieldsAsync(error)
      sinon.stub(sendgrid, 'sendEmail').returns(Promise.resolve(true))

      sendgrid.inviteUser(recipient, sessionUser, githubOrgResponse.id)
        .then(thisShouldNotBeCalled(done))
        .catch(function (err) {
          expect(err.message).to.equal(error.message)
          sinon.assert.calledOnce(sessionUser.findGithubOrgByGithubId)
          sinon.assert.calledWith(sessionUser.findGithubOrgByGithubId, '1234sfasdf')
          sinon.assert.notCalled(sendgrid.sendEmail)
          done()
        })
        .catch(thisShouldNotBeCalled(done))
    })

    it('should log the error and return it', function (done) {
      sinon.stub(sessionUser, 'findGithubOrgByGithubId').yieldsAsync(null, githubOrgResponse)
      // Stub this like this so that the rejected promise isn't generated until the function is called
      // If you do it as a .returns, the promise is created immediately, and it throws a warning
      // during the test
      sendgrid.sendEmail = sinon.spy(function () {
        return Promise.reject(error)
      })
      sendgrid.inviteUser(recipient, sessionUser, githubOrgResponse.id)
        .then(thisShouldNotBeCalled(done))
        .catch(function (err) {
          expect(err.message).to.equal(error.message)
          sinon.assert.calledOnce(sessionUser.findGithubOrgByGithubId)
          sinon.assert.calledWith(sessionUser.findGithubOrgByGithubId, '1234sfasdf')
          sinon.assert.calledOnce(sendgrid.sendEmail)
          done()
        })
        .catch(thisShouldNotBeCalled(done))
    })
  })

  describe('inviteAdmin', function () {
    var sessionUser = {
      email: 'ted@something.com',
      accounts: {
        github: {
          displayName: 'ted',
          id: 'sadfasf23r2q31234'
        }
      }
    }
    var recipient = {
      email: 'nathan@runnable.com',
      github: 'adsfasdfadsf'
    }
    var error = new Error('This is an error')
    var message = 'hello'
    var sendgrid

    beforeEach(function (done) {
      sendgrid = new SendGridModel()
      error = new Error('This is an error')
      sendgrid._sendgrid = {
        sendAsync: noop,
        Email: SendGridEmail
      }
      sendgrid.logData = {}
      done()
    })
    it('should attempt to send admin emails with the given arguments', function (done) {
      sinon.stub(sendgrid, 'sendEmail').returns(Promise.resolve(true))

      sendgrid.inviteAdmin(recipient, sessionUser, message)
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
        .catch(thisShouldNotBeCalled(done))
    })

    it('should log the error and return it', function (done) {
      sinon.stub(sendgrid, 'sendEmail').returns(Promise.reject(error))

      sendgrid.inviteAdmin(recipient, sessionUser, message)
        .then(thisShouldNotBeCalled(done))
        .catch(function (err) {
          if (!err) {
            return thisShouldNotBeCalled(done)()
          }
          expect(err).to.equal(error)
          sinon.assert.calledOnce(sendgrid.sendEmail)
          done()
        })
        .catch(thisShouldNotBeCalled(done))
    })
  })
})
