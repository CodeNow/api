'use strict'
require('loadenv')()

const Boom = require('dat-middleware').Boom
const Code = require('code')
const Lab = require('lab')
const path = require('path')
const sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

const Github = require('models/apis/github')

const lab = exports.lab = Lab.script()
const moduleName = path.relative(process.cwd(), __filename)

const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = Code.expect
const it = lab.it

describe('github: ' + moduleName, function () {
  describe('isOrgMember', function () {
    it('should return 404 if getting orgs returned 404', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Orgs error')
      err.code = 404
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(err)
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('user is not a member of org')
        done()
      })
    })

    it('should return 502 in case other error', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Orgs error')
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(err)
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(502)
        expect(err.output.payload.message).to.equal('failed to get user orgs')
        done()
      })
    })

    it('should return 404 if not orgs were found (null)', function (done) {
      var github = new Github({token: 'some-token'})
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, null)
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('user is not a member of org')
        done()
      })
    })

    it('should return 404 if not orgs were found ([])', function (done) {
      var github = new Github({token: 'some-token'})
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, [])
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('user is not a member of org')
        done()
      })
    })

    it('should return 404 if orgs was not in the list', function (done) {
      var github = new Github({token: 'some-token'})
      var orgs = [{login: 'Runnable'}]
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, orgs)
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('user is not a member of org')
        done()
      })
    })

    it('should return true if org was found', function (done) {
      var github = new Github({token: 'some-token'})
      var orgs = [{login: 'CodeNow'}]
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, orgs)
      github.isOrgMember('CodeNow', function (err, isMember) {
        expect(err).to.not.exist()
        expect(isMember).to.be.true()
        done()
      })
    })
  })

  describe('_listRepoHooks', function () {
    it('should return 404 if repo was not found', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Not found')
      err.code = 404
      sinon.stub(github.repos, 'getHooks').yieldsAsync(err)
      github._listRepoHooks('codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(404)
        expect(boomErr.output.payload.message).to.equal('Github repo codenow/api not found.')
        expect(boomErr.data.err.code).to.equal(err.code)
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.getHooks.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        done()
      })
    })
    it('should return 502 if some error happened', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Some error')
      sinon.stub(github.repos, 'getHooks').yieldsAsync(err)
      github._listRepoHooks('codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(502)
        expect(boomErr.output.payload.message).to.equal('Failed to get github repo hooks for codenow/api')
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.getHooks.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        done()
      })
    })
    it('should return 404 if repo was renamed', function (done) {
      var github = new Github({token: 'some-token'})
      var redirectResp = {
        message: 'Moved Permanently',
        url: 'https://api.github.com/repositories/20696842/hooks?per_page=100' +
          '&access_token=aeb93139d50473aa5f812bf9731d4f04fb842864',
        documentation_url: 'https://developer.github.com/v3/#http-redirects',
        meta: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4988',
          'x-ratelimit-reset': '1444181546',
          'x-oauth-scopes': 'read:org, read:repo_hook, repo, user:email',
          location: 'https://api.github.com/repositories/20696842/hooks' +
            '?per_page=100&access_token=aeb93139d50473aa5f812bf9731d4f04fb842864',
          status: '301 Moved Permanently'
        }
      }
      sinon.stub(github.repos, 'getHooks').yieldsAsync(null, redirectResp)
      github._listRepoHooks('codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(404)
        expect(boomErr.output.payload.message).to.equal('Github repo codenow/api not found, because it moved')
        var query = github.repos.getHooks.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        done()
      })
    })
    it('should work if no errors occured', function (done) {
      var github = new Github({token: 'some-token'})
      sinon.stub(github.repos, 'getHooks').yieldsAsync(null, [{id: 1}])
      github._listRepoHooks('codenow/api', function (err, hooks) {
        expect(err).to.not.exist()
        expect(hooks.length).to.equal(1)
        expect(hooks[0].id).to.equal(1)
        done()
      })
    })
  })
  describe('_deleteRepoHook', function () {
    it('should return 404 if repo wasnot found', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Not found')
      err.code = 404
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(err)
      github._deleteRepoHook(1, 'codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(404)
        expect(boomErr.output.payload.message).to.equal('Github repo hook 1 not found.')
        expect(boomErr.data.err.code).to.equal(err.code)
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.deleteHook.getCall(0).args[0]
        expect(query.id).to.equal(1)
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        done()
      })
    })
    it('should return 502 if some error happened', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Some error')
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(err)
      github._deleteRepoHook(1, 'codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(502)
        expect(boomErr.output.payload.message).to.equal('Failed to delete github repo hook with id 1')
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.deleteHook.getCall(0).args[0]
        expect(query.id).to.equal(1)
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        done()
      })
    })
    it('should work if no errors occured', function (done) {
      var github = new Github({token: 'some-token'})
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(null, {})
      github._deleteRepoHook(1, 'codenow/api', function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
  })
  describe('_createRepoHook', function () {
    it('should return 404 if repo wasnot found', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Not found')
      err.code = 404
      sinon.stub(github.repos, 'createHook').yieldsAsync(err)
      github._createRepoHook('codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(404)
        expect(boomErr.output.payload.message).to.equal('Github repo codenow/api not found.')
        expect(boomErr.data.err.code).to.equal(err.code)
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.createHook.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        expect(query.name).to.equal(process.env.GITHUB_HOOK_NAME)
        var hookUrl = process.env.GITHUB_WEBHOOK_URL
        expect(query.config.url).to.equal(hookUrl)
        expect(query.config.content_type).to.equal('json')
        expect(query.events[0]).to.equal('*')
        done()
      })
    })
    it('should return 502 if some error happened', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Some error')
      sinon.stub(github.repos, 'createHook').yieldsAsync(err)
      github._createRepoHook('codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(502)
        expect(boomErr.output.payload.message).to.equal('Failed to create github repo hook for codenow/api')
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.createHook.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        expect(query.name).to.equal(process.env.GITHUB_HOOK_NAME)
        var hookUrl = process.env.GITHUB_WEBHOOK_URL
        expect(query.config.url).to.equal(hookUrl)
        expect(query.config.content_type).to.equal('json')
        expect(query.events[0]).to.equal('*')
        done()
      })
    })
    it('should return 409 if hook already exist', function (done) {
      var github = new Github({token: 'some-token'})
      var err = new Error('Validation Failed')
      err.code = 422
      err.message = JSON.stringify({
        'message': 'Validation Failed',
        'errors': [{
          resource: 'Hook',
          code: 'custom',
          message: 'Hook already exists on this repository'
        }],
        'documentation_url': 'https://developer.github.com/v3/repos/hooks/#create-a-hook'
      })
      sinon.stub(github.repos, 'createHook').yieldsAsync(err)
      github._createRepoHook('codenow/api', function (boomErr) {
        expect(boomErr).to.exist()
        expect(boomErr.output.statusCode).to.equal(409)
        expect(boomErr.output.payload.message).to.equal('Github repo codenow/api already has a hook.')
        expect(boomErr.data.err.message).to.equal(err.message)
        var query = github.repos.createHook.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        expect(query.name).to.equal(process.env.GITHUB_HOOK_NAME)
        var hookUrl = process.env.GITHUB_WEBHOOK_URL
        expect(query.config.url).to.equal(hookUrl)
        expect(query.config.content_type).to.equal('json')
        expect(query.events[0]).to.equal('*')
        done()
      })
    })
    it('should work if no errors occured', function (done) {
      var github = new Github({token: 'some-token'})
      sinon.stub(github.repos, 'createHook').yieldsAsync(null, {
        _id: 1
      })
      github._createRepoHook('codenow/api', function (err, hook) {
        expect(err).to.not.exist()
        expect(hook._id).to.equal(1)
        var query = github.repos.createHook.getCall(0).args[0]
        expect(query.user).to.equal('codenow')
        expect(query.repo).to.equal('api')
        expect(query.name).to.equal(process.env.GITHUB_HOOK_NAME)
        var hookUrl = process.env.GITHUB_WEBHOOK_URL
        expect(query.config.url).to.equal(hookUrl)
        expect(query.config.content_type).to.equal('json')
        expect(query.events[0]).to.equal('*')
        done()
      })
    })
  })
  describe('createRepoHookIfNotAlready', function () {
    it('should fail if listing hooks failed', function (done) {
      var github = new Github({token: 'some-token'})
      var err = Boom.notFound('Repo not found')
      sinon.stub(github, '_listRepoHooks').yieldsAsync(err)
      sinon.spy(github, '_createRepoHook')
      github.createRepoHookIfNotAlready('codenowapi', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Repo not found')
        expect(github._listRepoHooks.callCount).to.equal(1)
        expect(github._createRepoHook.callCount).to.equal(0)
        done()
      })
    })
    it('should fail if hook creation failed', function (done) {
      var github = new Github({token: 'some-token'})
      var err = Boom.notFound('Repo not found')
      sinon.stub(github, '_listRepoHooks').yieldsAsync(null, [])
      sinon.stub(github, '_createRepoHook').yieldsAsync(err)
      github.createRepoHookIfNotAlready('codenowapi', function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(404)
        expect(err.output.payload.message).to.equal('Repo not found')
        expect(github._listRepoHooks.callCount).to.equal(1)
        expect(github._createRepoHook.callCount).to.equal(1)
        done()
      })
    })
    it('should not fail if hook creation failed with 409', function (done) {
      var github = new Github({token: 'some-token'})
      var err = Boom.conflict('Hook exist')
      sinon.stub(github, '_listRepoHooks').yieldsAsync(null, [])
      sinon.stub(github, '_createRepoHook').yieldsAsync(err)
      github.createRepoHookIfNotAlready('codenowapi', function (err) {
        expect(err).to.not.exist()
        expect(github._listRepoHooks.callCount).to.equal(1)
        expect(github._createRepoHook.callCount).to.equal(1)
        done()
      })
    })
    it('should not fail if hook was found', function (done) {
      var github = new Github({token: 'some-token'})
      var hooks = [
        {
          config: {
            url: process.env.GITHUB_WEBHOOK_URL
          },
          active: true,
          events: ['*']
        }
      ]
      sinon.stub(github, '_listRepoHooks').yieldsAsync(null, hooks)
      sinon.spy(github, '_createRepoHook')
      github.createRepoHookIfNotAlready('codenowapi', function (err) {
        expect(err).to.not.exist()
        expect(github._listRepoHooks.callCount).to.equal(1)
        expect(github._createRepoHook.callCount).to.equal(0)
        done()
      })
    })
  })

  describe('createHooksAndKeys', () => {
    var github

    beforeEach((done) => {
      github = new Github({token: 'some-token'})
      sinon.stub(github, 'createRepoHookIfNotAlready')
      sinon.stub(github, 'addDeployKeyIfNotAlreadyAsync')
      done()
    })

    it('should return keys', (done) => {
      const testRepoName = 'runnable/robot'
      const testKeys = {
        fire: '0',
        ice: '1'
      }
      github.createRepoHookIfNotAlready.yieldsAsync()
      github.addDeployKeyIfNotAlreadyAsync.resolves(testKeys)
      github.createHooksAndKeys(testRepoName)
        .then((keys) => {
          sinon.assert.calledOnce(github.createRepoHookIfNotAlready)
          sinon.assert.calledWith(github.createRepoHookIfNotAlready, testRepoName)
          sinon.assert.calledOnce(github.addDeployKeyIfNotAlreadyAsync)
          sinon.assert.calledWith(github.addDeployKeyIfNotAlreadyAsync, testRepoName)
          expect(keys).to.equal(testKeys)
          done()
        })
    })
  }) // end createHooksAndKeys

  /* describe('_getAllOrgs', () => {
    let github

    beforeEach((done) => {
      github = new Github({token: 'some-token'})
      sinon.stub(github.user,'getOrgs').yields(null, [])
      done()
    })

    it('should return no results', (done) => {
      let opts = {}
      github.user.getOrgs.yields(null, {data:[]});
      github._getAllOrgs(opts, null, (err, allOrgs) => {
        sinon.assert.calledOnce(github.user.getOrgs)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 1}, null, sinon.match.func)
        expect(allOrgs.length).to.equal(0)
        done()
      })

    })

    it('should return 99 results', (done) => {
      let opts = {}

      github.user.getOrgs.yields(null, {data:new Array(99)})
      github._getAllOrgs(opts, null, (err, allOrgs) => {
        sinon.assert.calledOnce(github.user.getOrgs)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 1}, null, sinon.match.func)
        expect(allOrgs.length).to.equal(99)
        done()
      })
    })

    it('should return 100 results', (done) => {
      let opts = {}

      github.user.getOrgs.onFirstCall().yields(null, {data:new Array(100)})
      github.user.getOrgs.onSecondCall().yields(null, {data:[]})
      github._getAllOrgs(opts, null, (err, allOrgs) => {
        sinon.assert.calledTwice(github.user.getOrgs)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 1}, null, sinon.match.func)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 2}, null, sinon.match.func)
        expect(allOrgs.length).to.equal(100)
        done()
      })
    })

    it('should return 201 results', (done) => {
      let opts = {}

      github.user.getOrgs.onFirstCall().yields(null, {data:new Array(100)})
      github.user.getOrgs.onSecondCall().yields(null, {data:new Array(100)})
      github.user.getOrgs.onThirdCall().yields(null, {data:new Array(1)})
      github._getAllOrgs(opts, null, (err, allOrgs) => {
        sinon.assert.calledThrice(github.user.getOrgs)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 1}, null, sinon.match.func)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 2}, null, sinon.match.func)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 100, page: 3}, null, sinon.match.func)
        expect(allOrgs.length).to.equal(201)
        done()
      })
    })

    it('should return 40 results, over 2 pages, with three calls', (done) => {
      let opts = {per_page: 20}

      github.user.getOrgs.onFirstCall().yields(null, {data:new Array(20)})
      github.user.getOrgs.onSecondCall().yields(null, {data:new Array(20)})
      github.user.getOrgs.onThirdCall().yields(null, {data:[]})
      github._getAllOrgs(opts, null, (err, allOrgs) => {
        sinon.assert.calledThrice(github.user.getOrgs)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 20, page: 1}, null, sinon.match.func)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 20, page: 2}, null, sinon.match.func)
        sinon.assert.calledWith(github.user.getOrgs, {per_page: 20, page: 3}, null, sinon.match.func)
        expect(allOrgs.length).to.equal(40)
        done()
      })
    })
  }) */
})
