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
var BigPoppaClient = require('@runnable/big-poppa-client')
var bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)
var Worker = require('workers/stripe.invoice.payment-succeeded')

var testJob = {
  invoice: {
    id: '90210'
  },
  organization: {
    id: 1486
  }
}

var testOrganization = {
  githubId: 'hey hey my my'
}

describe('stripe.invoice.payment-succeeded Worker', function () {
  beforeEach(function (done) {
    sinon.stub(messenger, 'messageRoom').resolves('yes')
    sinon.stub(BigPoppaClient.prototype, 'getOrganization').resolves(testOrganization)
    done()
  })

  afterEach(function (done) {
    messenger.messageRoom.restore()
    BigPoppaClient.prototype.getOrganization.restore()
    done()
  })

    describe('worker', function () {
      it('should get the organizations github id and send a socket message', function (done) {
        Worker.task(testJob).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(bigPoppaClient.getOrganization)
          sinon.assert.calledWith(messenger.messageRoom, 'org', testOrganization.githubId, { task: 'stripe.invoice.payment-succeeded' })
          done()
        })
      })
    })
})
