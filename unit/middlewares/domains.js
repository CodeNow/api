/**
 * @module unit/middlewares/domains
 */
'use strict'

require('loadenv')()

var Code = require('code')
var Lab = require('lab')
var keypather = require('keypather')()

var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var domainsMiddlware = require('middlewares/domains')

/**
 * Helper to test state of domain data before session initialized & domain updated
 */
function testPreSessionRunnableDomainData () {
  expect(process.domain.runnableData.tid).to.match(/(\w{8}(-\w{4}){3}-\w{12}?)/)
  // middleware runs before session initialized
  expect(process.domain.runnableData.userGithubUsername).to.equal(null)
  expect(process.domain.runnableData.userGithubId).to.equal(null)
  expect(process.domain.runnableData.userGithubEmail).to.equal(null)
}

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('middlewares/domains unit test: ' + moduleName, function () {
  var ctx = {}

  afterEach(function (done) {
    delete process.domain.runnableData
    process.domain.exit()
    process.domain.dispose()
    done()
  })

  describe('initialization', function () {
    beforeEach(function (done) {
      ctx.fakeReq = {
        sessionUser: null,
        method: 'POST'
      }
      ctx.fakeRes = {
        '_headers': {},
        setHeader: function () {}
      }
      done()
    })

    it('should set required user data on domain', function (done) {
      expect(process.domain.runnableData).to.be.undefined()
      domainsMiddlware(ctx.fakeReq, ctx.fakeRes, function next () {
        testPreSessionRunnableDomainData()
        done()
      })
    })
  })

  describe('updates after-session initialized', function () {
    beforeEach(function (done) {
      ctx.fakeReq = {
        sessionUser: null,
        method: 'POST'
      }
      ctx.fakeRes = {
        '_headers': {},
        setHeader: function () {}
      }
      done()
    })

    it('should update session data on domain', function (done) {
      domainsMiddlware(ctx.fakeReq, ctx.fakeRes, function next () {
        testPreSessionRunnableDomainData()
        var tid = process.domain.runnableData.tid
        keypather.set(ctx.fakeReq, 'sessionUser.accounts.github.username', 'cflynn07')
        keypather.set(ctx.fakeReq, 'sessionUser.accounts.github.id', 88888)
        keypather.set(ctx.fakeReq, 'sessionUser.email', 'test@gmail.com')
        domainsMiddlware.updateDomain(ctx.fakeReq, ctx.fakeRes, function next () {
          expect(process.domain.runnableData.tid).to.equal(tid)
          expect(process.domain.runnableData.userGithubUsername).to.equal('cflynn07')
          expect(process.domain.runnableData.userGithubId).to.equal(88888)
          expect(process.domain.runnableData.userGithubEmail).to.equal('test@gmail.com')
          done()
        })
      })
    })
  })
/*
  descibe('errors', function () {
    it('should handle error', function (done) {
      done
    })
  })
*/
})
