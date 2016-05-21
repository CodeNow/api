/**
 * @module test/actions-github
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var ContextVersion = require('models/mongo/context-version')
var Mixpanel = require('models/apis/mixpanel')
var githubActions = require('routes/actions/github')

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var dockerMockEvents = require('./fixtures/docker-mock-events')
var generateKey = require('./fixtures/key-factory')
var hooks = require('./fixtures/github-hooks')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var primus = require('./fixtures/primus')
var request = require('request')
var rabbitMQ = require('models/rabbitmq')
var UserWhitelist = require('models/mongo/user-whitelist')
var sinon = require('sinon')

describe('Github - /actions/github', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(dock.start.bind(ctx))
  after(dock.stop.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  before(require('./fixtures/mocks/api-client').setup)
  after(require('./fixtures/mocks/api-client').clean)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-nock'))
  beforeEach(generateKey)
  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 429706,
        username: 'podviaznikov'
      }]
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)

  beforeEach(function (done) {
    // Prevent worker creation and github event publishing by rabbit
    sinon.stub(rabbitMQ, 'deleteInstance', function () {})
    done()
  })
  afterEach(function (done) {
    rabbitMQ.deleteInstance.restore()
    done()
  })

  describe('ping', function () {
    it('should return OKAY', function (done) {
      var options = hooks().ping
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(202)
        expect(body).to.equal('Hello, Github Ping!')
        done()
      })
    })
  })

  describe('disabled hooks', function () {
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS
      delete process.env.ENABLE_GITHUB_HOOKS
      done()
    })
    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting
      done()
    })
    it('should send response immediately if hooks are disabled', function (done) {
      var options = hooks().pull_request_sync
      options.json.ref = 'refs/heads/someotherbranch'
      require('./fixtures/mocks/github/users-username')(429706, 'podviaznikov')
      request.post(options, function (err, res) {
        if (err) {
          done(err)
        } else {
          expect(res.statusCode).to.equal(202)
          expect(res.body).to.match(/Hooks are currently disabled\. but we gotchu/)
          done()
        }
      })
    })
  })

  describe('not supported event type', function () {
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS
      process.env.ENABLE_GITHUB_HOOKS = 'true'
      done()
    })
    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting
      done()
    })
    it('should return OKAY', function (done) {
      var options = hooks().issue_comment
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(202)
        expect(body).to.equal('No action set up for that payload.')
        done()
      })
    })
  })

  describe('created tag', function () {
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS
      process.env.ENABLE_GITHUB_HOOKS = 'true'
      done()
    })
    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting
      done()
    })
    beforeEach(function (done) {
      sinon.stub(UserWhitelist, 'findOne').yieldsAsync(null, { allowed: true })
      done()
    })
    afterEach(function (done) {
      UserWhitelist.findOne.restore()
      done()
    })

    it('should return message that we cannot handle tags events', function (done) {
      var options = hooks().push
      options.json.ref = 'refs/tags/v1'
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(202)
        expect(body).to.equal("Cannot handle tags' related events")
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'podviaznikov' })
        done()
      })
    })
  })

  describe('push event', function () {
    var ctx = {}
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS
      ctx.mixPanelStub = sinon.stub(Mixpanel.prototype, 'track', function () {})
      process.env.ENABLE_GITHUB_HOOKS = 'true'
      done()
    })
    afterEach(function (done) {
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting
      ctx.mixPanelStub.restore()
      done()
    })
    beforeEach(function (done) {
      multi.createUser(function (err, user) {
        if (err) { return done(err) }
        ctx.user = user
        ctx.request = user.client.request
        done()
      })
    })
    beforeEach(function (done) {
      sinon.stub(UserWhitelist, 'findOne').yieldsAsync(null, { allowed: true })
      sinon.spy(githubActions, 'checkCommitterIsRunnableUser')
      done()
    })
    afterEach(function (done) {
      UserWhitelist.findOne.restore()
      githubActions.checkCommitterIsRunnableUser.restore()
      done()
    })

    it('should return 202 if there is neither autoDeploy nor autoLaunch is needed',
      function (done) {
        var login = ctx.user.attrs.accounts.github.login
        var githubId = ctx.user.attrs.accounts.github.id
        var data = {
          branch: 'some-branch',
          repo: 'some-repo',
          ownerId: ctx.user.attrs.accounts.github.id,
          owner: login
        }
        var options = hooks(data).push
        request.post(options, function (err, res, body) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(202)
          expect(body).to.equal('Nothing to deploy or fork')
          done()
        })
      })

    it('should return a 403 if the repo owner is not whitelisted', function (done) {
      // No org whitelisted
      UserWhitelist.findOne.yieldsAsync(null, null)

      var data = {
        branch: 'some-branch',
        repo: 'some-repo',
        ownerId: 3217371238,
        owner: 'anton'
      }
      var options = hooks(data).push
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(403)
        expect(body).to.match(/Repo owner is not registered on Runnable/i)
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'anton' })
        sinon.assert.calledOnce(githubActions.checkCommitterIsRunnableUser)
        done()
      })
    })

    it('should return a 403 if the repo owner is whitelisted but disabled', function (done) {
      // disabled organization
      UserWhitelist.findOne.yieldsAsync(null, { allowed: false })

      var data = {
        branch: 'some-branch',
        repo: 'some-repo',
        ownerId: 3217371238,
        owner: 'anton'
      }
      var options = hooks(data).push
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(403)
        expect(body).to.match(/organization has been suspended/i)
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'anton' })
        done()
      })
    })

    describe('autofork', function () {
      beforeEach(function (done) {
        multi.createAndTailInstance(primus, function (err, instance, build, user, modelsArr) {
          if (err) { return done(err) }
          ctx.contextVersion = modelsArr[0]
          ctx.context = modelsArr[1]
          ctx.build = build
          ctx.user = user
          ctx.instance = instance
          done()
        })
      })

      it('should send 202 and message if autoforking disabled', function (done) {
        var acv = ctx.contextVersion.attrs.appCodeVersions[0]
        var user = ctx.user.attrs.accounts.github
        var data = {
          branch: 'feature-1',
          repo: acv.repo,
          ownerId: user.id,
          owner: user.login
        }
        var options = hooks(data).push
        var username = user.login
        require('./fixtures/mocks/github/users-username')(user.id, username)
        require('./fixtures/mocks/github/user')(username)
        request.post(options, function (err, res, body) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(202)
          expect(body).to.equal('Autoforking of instances on branch push is disabled for now')
          sinon.assert.calledOnce(UserWhitelist.findOne)
          sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: sinon.match.string })
          finishAllIncompleteVersions(done)
        })
      })

      describe('enabled autoforking', function () {
        beforeEach(function (done) {
          ctx.originalAutoForking = process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH
          process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = 'true'
          done()
        })
        afterEach(function (done) {
          process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = ctx.originalAutoForking
          done()
        })

        it('should fork instance from master', function (done) {
          var login = ctx.user.attrs.accounts.github.login
          var id = ctx.user.attrs.accounts.github.id
          require('./fixtures/mocks/github/users-username')(id, login)
          require('./fixtures/mocks/docker/build-logs')()
          // emulate instance deploy event
          var acv = ctx.contextVersion.attrs.appCodeVersions[0]
          var data = {
            branch: 'feature-1',
            repo: acv.repo,
            ownerId: id,
            owner: login
          }
          var options = hooks(data).push

          // post must complete
          request.post(options, function (err, res, cvIds) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(cvIds).to.exist()
            expect(cvIds).to.be.an.array()
            expect(cvIds).to.have.length(1)
            expect(cvIds[0]).to.exist()
            done()
          })
        })

        describe('delete branch', function () {
          it('should return 0 instancesIds if nothing was deleted', function (done) {
            var options = hooks().push
            options.json.deleted = true
            request.post(options, function (err, res, body) {
              if (err) { return done(err) }
              expect(res.statusCode).to.equal(202)
              expect(body).to.equal('No appropriate work to be done finishing.')
              sinon.assert.calledOnce(UserWhitelist.findOne)
              sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'podviaznikov' })
              done()
            })
          })
        })
      })
    })

    describe('autodeploy', function () {
      beforeEach(function (done) {
        ctx.originalAutoForking = process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH
        process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = 'true'
        done()
      })
      afterEach(function (done) {
        process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = ctx.originalAutoForking
        done()
      })
      beforeEach(function (done) {
        multi.createAndTailInstance(primus, function (err, instance, build, user, modelsArr) {
          if (err) { return done(err) }
          ctx.contextVersion = modelsArr[0]
          ctx.context = modelsArr[1]
          ctx.build = build
          ctx.user = user
          ctx.instance = instance
          done()
        })
      })

      it('should not redeploy locked instance', function (done) {
        ctx.instance.update({ locked: true }, function (err) {
          if (err) { return done(err) }
          var acv = ctx.contextVersion.attrs.appCodeVersions[0]
          var user = ctx.user.attrs.accounts.github
          var data = {
            branch: 'master',
            repo: acv.repo,
            ownerId: user.id,
            owner: user.login
          }
          var options = hooks(data).push
          options.json.created = false
          var username = user.login

          require('./fixtures/mocks/github/users-username')(user.id, username)
          require('./fixtures/mocks/github/user')(username)
          request.post(options, function (err, res, body) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(202)
            expect(body).to.equal('No instances should be deployed')
            sinon.assert.calledOnce(UserWhitelist.findOne)
            sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: sinon.match.string })
            done()
          })
        })
      })

      it('should report to mixpanel when a registered user pushes to a repo', function (done) {
        Mixpanel.prototype.track.restore()
        sinon.stub(Mixpanel.prototype, 'track', function (eventName, eventData) {
          expect(eventName).to.equal('github-push')
          expect(eventData.repoName).to.equal(data.repo)
        })
        var data = {
          repo: 'hellonode',
          branch: 'master',
          ownerId: ctx.user.attrs.accounts.github.id,
          owner: 'cflynn07'
        }
        var options = hooks(data).push
        request.post(options, function (err) {
          if (err) { return done(err) }
          Mixpanel.prototype.track.restore()
          sinon.assert.calledOnce(UserWhitelist.findOne)
          sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: sinon.match.string })
          done()
        })
      })
    })
  })
})

function finishAllIncompleteVersions (cb) {
  var incompleteBuildsQuery = {
    'build.started': { $exists: true },
    'build.completed': { $exists: false }
  }
  var fields = null // all fields
  var opts = { sort: ['build.started'] }
  ContextVersion.find(incompleteBuildsQuery, fields, opts, function (err, versions) {
    if (err) { return cb(err) }
    var buildIds = []
    versions
      .filter(function (version) {
        // filter versions by unique build ids
        // a non unique build id would indicate a deduped build
        var buildId = version.build._id.toString()
        if (!~buildIds.indexOf(buildId)) {
          buildIds.push(buildId)
          return true
        }
      })
      .forEach(function (version) {
        // emit build complete events for each unique build
        primus.expectActionCount('build_running', 1, function () {
          dockerMockEvents.emitBuildComplete(version)
        })
      })
    if (cb) {
      cb()
    }
  })
}
