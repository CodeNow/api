'use strict'
const Lab = require('lab')
const Promise = require('bluebird')
const sinon = require('sinon')

const WebhookService = require('models/services/webhook-service')
const Worker = require('workers/github.pull-request.opened')

const lab = exports.lab = Lab.script()
require('sinon-as-promised')(Promise)

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const it = lab.it

describe('github.pull-request.opened unit test', function () {
  let testJob

  beforeEach(function (done) {
    testJob = {
      payload: {
        some: {
          data: 1
        }
      }
    }
    done()
  })

  describe('task', function () {
    beforeEach(function (done) {
      sinon.stub(WebhookService, 'processGithookPullRequestOpened').resolves()
      done()
    })

    afterEach(function (done) {
      WebhookService.processGithookPullRequestOpened.restore()
      done()
    })

    it('should handle pr opened', function (done) {
      Worker.task(testJob).asCallback(function (err) {
        if (err) { return done(err) }

        sinon.assert.calledOnce(WebhookService.processGithookPullRequestOpened)
        sinon.assert.calledWith(WebhookService.processGithookPullRequestOpened, testJob.payload)
        done()
      })
    })
  })
})
