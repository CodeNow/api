'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var expect = require('code').expect
var sinon = require('sinon')

const Promise = require('bluebird')
const rabbitMQ = require('models/rabbitmq')

const UserService = require('models/services/user-service')

require('sinon-as-promised')(require('bluebird'))

var SshKeyService = require('models/services/ssh-key-service')

describe('sshKeyService', function () {
  describe('saveSshKey', function () {
    beforeEach(function (done) {
      sinon.stub(UserService, 'getByGithubId').resolves({
        id: 'einstein',
        organizations: [
          {
            id: 321,
            name: 'fail'
          },
          {
            id: 123,
            name: 'testPassed'
          }
        ]
      })
      done()
    })

    afterEach(function (done) {
      UserService.getByGithubId.restore()
      done()
    })

    it('should publish the event with the correct params', function (done) {
      let orgId = 123
      let sessionUser = 'schrodinger'
      let githubAccessToken = 'cat'

      sinon.spy(rabbitMQ, 'publishOrgUserSshKeyRequested')

      SshKeyService.saveSshKey(orgId, sessionUser, githubAccessToken)
        .tap(() => {
          sinon.assert.calledWith(rabbitMQ.publishOrgUserSshKeyRequested, {
            orgId,
            userId: 'einstein',
            githubAccessToken,
            keyName: 'Runnable key for testPassed'
          })
        })
        .asCallback(done)
    })
  })
})
