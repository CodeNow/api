/**
 * @module unit/models/apis/docker
 */
'use strict'
require('loadenv')()

var Code = require('code')
var Lab = require('lab')
var path = require('path')
var sinon = require('sinon')

var SendGrid = require('models/apis/sendgrid')
var Promise = require('bluebird')
var lab = exports.lab = Lab.script()

var describe = lab.describe
var expect = Code.expect
var beforeEach = lab.beforeEach
var it = lab.it
var moduleName = path.relative(process.cwd(), __filename)

function thisShouldNotBeCalled (cb) {
  return function () {
    cb(new Error('This shouldn\'t have been called'))
  }
}
describe('sendgrid: ' + moduleName, function () {
  describe('sendEmail', function () {
    it('should just send a normal email', function (done) {
      var sendgrid = new SendGrid()
      sendgrid._sendgrid.sendAsync = sinon.stub().returns(Promise.resolve(true))
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
    })
    it('should send an email with substitutions and a template', function (done) {
      var sendgrid = new SendGrid()
      sendgrid._sendgrid.sendAsync = sinon.stub().returns(Promise.resolve(true))
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
    })
    it('should throw the catch when a failure happens', function (done) {
      var sendgrid = new SendGrid()
      var error = new Error('this is an error')
      sendgrid._sendgrid.sendAsync = sinon.stub().returns(Promise.reject(error))
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
    })
  })
  describe('inviteUser', function () {
    var sessionUser = {
      accounts: {
        github: {
          id: 'sadfasf23r2q31234',
          displayName: 'nathan'
        }
      }
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
      sendgrid = new SendGrid()
      done()
    })
    it('should attempt to email normally', function (done) {
      sessionUser.findGithubOrgByGithubId = sinon.stub().yieldsAsync(null, githubOrgResponse)
      sendgrid.sendEmail = sinon.stub().returns(Promise.resolve(true))

      sendgrid.inviteUser(recipient, sessionUser, githubOrgResponse.id, function (err) {
        expect(err).to.be.undefined()
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
        done(err)
      })
        .catch(thisShouldNotBeCalled(done))
    })
    it('should log the github error if one happens', function (done) {
      sessionUser.findGithubOrgByGithubId = sinon.stub().yieldsAsync(error)
      sendgrid.sendEmail = sinon.stub().returns(Promise.resolve(true))

      sendgrid.inviteUser(recipient, sessionUser, githubOrgResponse.id, function (err) {
        if (!err) {
          return thisShouldNotBeCalled(done)()
        }
        expect(err.message).to.equal(error.message)
        sinon.assert.calledOnce(sessionUser.findGithubOrgByGithubId)
        sinon.assert.calledWith(sessionUser.findGithubOrgByGithubId, '1234sfasdf')

        sinon.assert.notCalled(sendgrid.sendEmail)
        done()
      })
        .catch(thisShouldNotBeCalled(done))
    })
    it('should log the error and return it', function (done) {
      sessionUser.findGithubOrgByGithubId = sinon.stub().yieldsAsync(null, githubOrgResponse)
      sendgrid.sendEmail = sinon.spy(function () {
        return Promise.reject(error)
      })

      sendgrid.inviteUser(recipient, sessionUser, githubOrgResponse.id, function (err) {
        if (!err) {
          return thisShouldNotBeCalled(done)()
        }
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
      accounts: {
        github: {
          email: 'ted@something.com',
          id: 'sadfasf23r2q31234',
          displayName: 'ted'
        }
      }
    }
    var recipient = {
      email: 'nathan@runnable.com',
      github: 'adsfasdfadsf'
    }
    var error = new Error('This is an error')
    var message = 'hello'
    it('should attempt to email the admin normally', function (done) {
      var sendgrid = new SendGrid()
      sendgrid.sendEmail = sinon.stub().returns(Promise.resolve(true))

      sendgrid.inviteAdmin(recipient, sessionUser, message, function (err) {
        expect(err).to.be.undefined()

        sinon.assert.calledOnce(sendgrid.sendEmail)
        var sendEmailOptions = sendgrid.sendEmail.args[0][0]

        expect(sendEmailOptions.email, 'email').to.equal(recipient.email)
        expect(sendEmailOptions.from, 'from').to.equal('ted@something.com')
        expect(sendEmailOptions.fromname, 'fromname').to.equal('ted')
        expect(sendEmailOptions.subject, 'subject').to.equal('ted has invited you to be an admin for a Runnable Team')
        expect(sendEmailOptions.body, 'body').to.contains(message)
        expect(sendEmailOptions.template, 'template').to.be.undefined()
        expect(sendEmailOptions.substitutions, 'substitutions').to.be.undefined()
        done(err)
      })
        .catch(thisShouldNotBeCalled(done))
    })
    it('should log the error and return it', function (done) {
      var sendgrid = new SendGrid()
      sendgrid.sendEmail = sinon.stub().returns(Promise.reject(error))

      sendgrid.inviteAdmin(recipient, sessionUser, message, function (err) {
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
