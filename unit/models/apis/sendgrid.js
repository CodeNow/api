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
        body: '11212312313'
      }
      sendgrid.sendEmail(emailOpts)
        .then(function () {
          sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync);
          var emailObject = sendgrid._sendgrid.sendAsync.args[0][0];
          expect(emailObject.to, 'to').to.equal(emailOpts.email)
          expect(emailObject.subject, 'subject').to.equal(emailOpts.subject)
          expect(emailObject.text, 'text').to.equal(emailOpts.body)
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
        substitutions: {
          'hello': 'chickenbutt'
        },
        template: 'asdasdasd'
      }
      sendgrid.sendEmail(emailOpts)
        .then(function () {
          sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync);
          var emailObject = sendgrid._sendgrid.sendAsync.args[0][0];
          expect(emailObject.to, 'to').to.equal(emailOpts.email)
          expect(emailObject.subject, 'subject').to.equal(emailOpts.subject)
          expect(emailObject.text, 'text').to.equal(emailOpts.body)
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
          sinon.assert.calledOnce(sendgrid._sendgrid.sendAsync);
          expect(error).to.equal(err)
          done()
        })
    })
  })
})
