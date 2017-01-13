/**
 * @module unit/workers/context-version.delete
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = require('code').expect
var it = lab.it
var Promise = require('bluebird')

var sinon = require('sinon')
require('sinon-as-promised')(Promise)

var messenger = require('socket/messenger')
var Worker = require('workers/organization.payment-method.added')

var testJob = {
  paymentMethodOwner: {
    email: 'henry@runnable.com',
    githubId: 94109
  },
  organization: {
    id: 1486,
    name: 'Pee Wee\'s Playhouse Organization'
  }
}


describe('Organization Payment Method Added Worker', function () {
  beforeEach(function (done) {
    sinon.stub(messenger, 'messageRoom').resolves('yes')
    done()
  })

  afterEach(function (done) {
    messenger.messageRoom.restore()
    done()
  })

  describe('worker', function () {
    it('should send a socket message', function (done) {
      Worker.task(testJob).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledWith(messenger.messageRoom, 'org', testJob.paymentMethodOwner.githubId, { task: 'organization.payment-method.added' })
        done()
      })
    })
  })
})
