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
var PullRequest = require('models/apis/pullrequest')
var Slack = require('notifications/slack')

var api = require('./fixtures/api-control')
var createCount = require('callback-count')
var dock = require('./fixtures/dock')
var dockerMockEvents = require('./fixtures/docker-mock-events')
var exists = require('101/exists')
var expects = require('./fixtures/expects')
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
    sinon.stub(rabbitMQ, 'publishGithubEvent')
    done()
  })
  afterEach(function (done) {
    rabbitMQ.deleteInstance.restore()
    rabbitMQ.publishGithubEvent.restore()
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

    it('should publish the github event job via RabbitMQ', function (done) {
      var options = hooks().issue_comment
      request.post(options, function (err) {
        if (err) { return done(err) }
        expect(rabbitMQ.publishGithubEvent.calledOnce).to.be.true()
        expect(rabbitMQ.publishGithubEvent.firstCall.args[0])
          .to.equal(options.headers['x-github-delivery'])
        expect(rabbitMQ.publishGithubEvent.firstCall.args[1])
          .to.equal(options.headers['x-github-event'])
        expect(rabbitMQ.publishGithubEvent.firstCall.args[2])
          .to.deep.equal(options.json)
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
      sinon.stub(UserWhitelist, 'findOne').yieldsAsync(null, {})
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

    it('should publish the github event job via RabbitMQ', function (done) {
      var options = hooks().push
      options.json.ref = 'refs/tags/v1'
      request.post(options, function (err) {
        if (err) { return done(err) }
        expect(rabbitMQ.publishGithubEvent.calledOnce).to.be.true()
        expect(rabbitMQ.publishGithubEvent.firstCall.args[0])
          .to.equal(options.headers['x-github-delivery'])
        expect(rabbitMQ.publishGithubEvent.firstCall.args[1])
          .to.equal(options.headers['x-github-event'])
        expect(rabbitMQ.publishGithubEvent.firstCall.args[2])
          .to.deep.equal(options.json)
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
      sinon.stub(UserWhitelist, 'findOne').yieldsAsync(null, {})
      done()
    })
    afterEach(function (done) {
      UserWhitelist.findOne.restore()
      done()
    })

    it('should publish the github event job via RabbitMQ', function (done) {
      var options = hooks().push
      request.post(options, function (err) {
        if (err) { return done(err) }
        expect(rabbitMQ.publishGithubEvent.calledOnce).to.be.true()
        expect(rabbitMQ.publishGithubEvent.firstCall.args[0])
          .to.equal(options.headers['x-github-delivery'])
        expect(rabbitMQ.publishGithubEvent.firstCall.args[1])
          .to.equal(options.headers['x-github-event'])
        expect(rabbitMQ.publishGithubEvent.firstCall.args[2])
          .to.deep.equal(options.json)
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'podviaznikov' })
        done()
      })
    })

    it('should return 202 if there is neither autoDeploy nor autoLaunch is needed',
      function (done) {
        var login = ctx.user.attrs.accounts.github.login
        var githubId = ctx.user.attrs.accounts.github.id
        require('./fixtures/mocks/github/users-username')(githubId, login)
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
        expect(body).to.match(/Repo owner is not registered in Runnable/i)
        sinon.assert.calledOnce(UserWhitelist.findOne)
        sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: 'anton' })
        done()
      })
    })

    describe('autofork', function () {
      var slackStub
      beforeEach(function (done) {
        slackStub = sinon.stub(Slack.prototype, 'notifyOnAutoFork')
        done()
      })
      afterEach(function (done) {
        slackStub.restore()
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
          var settings = {
            owner: {
              github: user.attrs.accounts.github.id
            }
          }
          user.createSetting({json: settings}, function (err, body) {
            if (err) { return done(err) }
            expect(body._id).to.exist()
            ctx.settingsId = body._id
            done()
          })
        })
      })

      it('should send a 404 and not autofork if the committer is not a Github user',
        function (done) {
          var ownerGithubId = ctx.user.attrs.accounts.github.id
          var ownerUsername = ctx.user.attrs.accounts.github.login
          var committerUsername = 'non-github-user'
          require('./fixtures/mocks/github/users-username')(99567, committerUsername, {
            fail: true
          })
          var acv = ctx.contextVersion.attrs.appCodeVersions[0]
          var data = {
            branch: 'some-branch-that-doesnt-exist',
            repo: acv.repo,
            ownerId: ownerGithubId,
            owner: ownerUsername,
            committer: committerUsername
          }
          var options = hooks(data).push
          request.post(options, function (err, res, body) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(404)
            done()
          })
        })

      it('should send a 403 and not autofork if the committer is not a Runnable user',
        function (done) {
          var ownerGithubId = ctx.user.attrs.accounts.github.id
          var ownerUsername = ctx.user.attrs.accounts.github.login
          var committerUsername = 'thejsj'
          require('./fixtures/mocks/github/users-username')(1, committerUsername)
          var acv = ctx.contextVersion.attrs.appCodeVersions[0]
          var data = {
            branch: 'some-branch-that-doesnt-exist',
            repo: acv.repo,
            ownerId: ownerGithubId,
            owner: ownerUsername,
            committer: committerUsername
          }
          var options = hooks(data).push
          request.post(options, function (err, res, body) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(403)
            expect(body).to.match(/commit.*not.*runnable.*user/i)
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
        var successStub
        beforeEach(function (done) {
          ctx.originalAutoForking = process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH
          process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = 'true'
          successStub = sinon.stub(PullRequest.prototype, 'deploymentSucceeded')
          done()
        })
        afterEach(function (done) {
          process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = ctx.originalAutoForking
          successStub.restore()
          done()
        })

        it('should fork instance from master', function (done) {
          // three callbacks here:
          // 1. post should complete
          // 2. context versions should finish
          // 3. 'start' action from primus
          var finalCount = createCount(3, function (err) {
            if (err) { return done(err) }
            // validate what we stubbed
            sinon.assert.calledOnce(successStub)
            sinon.assert.calledOnce(slackStub)
            sinon.assert.calledWith(
              slackStub,
              sinon.match.object,
              sinon.match.object
            )
            var forkedInstance = slackStub.args[0][1]
            expect(forkedInstance.name).to.equal('feature-1-' + ctx.instance.attrs.name)
            sinon.assert.calledOnce(UserWhitelist.findOne)
            sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: login.toLowerCase() })
            done()
          })

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

          var contextCount = finishContextVersions(1, finalCount.next)

          // 3. wait for container create worker to finish
          primus.expectActionCount('start', 1, finalCount.next)

          // post must complete
          request.post(options, function (err, res, cvIds) {
            if (err) { return finalCount.next(err) }
            expect(res.statusCode).to.equal(200)
            expect(cvIds).to.exist()
            expect(cvIds).to.be.an.array()
            expect(cvIds).to.have.length(1)
            expect(cvIds[0]).to.exist()
            contextCount(cvIds[0])
            finalCount.next()
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

          it('should return 1 instancesIds if 1 instance was deleted', function (done) {
            require('./fixtures/mocks/docker/build-logs')()
            rabbitMQ.deleteInstance.restore()
            var acv = ctx.contextVersion.attrs.appCodeVersions[0]
            var user = ctx.user.attrs.accounts.github
            var data = {
              branch: 'feature-1',
              repo: acv.repo,
              ownerId: user.id,
              owner: user.login
            }
            var username = user.login
            // emulate instance deploy event

            var options = hooks(data).push

            var countCb = createCount(2, done)
            require('./fixtures/mocks/github/users-username')(user.id, username)
            require('./fixtures/mocks/github/user')(username)
            require('./fixtures/mocks/github/users-username')(user.id, username)
            require('./fixtures/mocks/github/user')(username)

            // counter for finishing building forks.
            var contextCount = finishContextVersions(1, function (err) {
              if (err) { return countCb.next(err) }
              sinon.assert.calledOnce(slackStub)
              sinon.assert.calledWith(
                slackStub,
                sinon.match.object,
                sinon.match.object
              )
              // at this point, the create worker has finished.

              // wait for the deleteInstance task to be enqueued.
              sinon.stub(rabbitMQ, 'deleteInstance', function () { countCb.next() })

              var deleteOptions = hooks(data).push
              deleteOptions.json.deleted = true
              require('./fixtures/mocks/github/user-id')(
                ctx.user.attrs.accounts.github.id,
                ctx.user.attrs.accounts.github.login
              )
              require('./fixtures/mocks/github/user-id')(
                ctx.user.attrs.accounts.github.id,
                ctx.user.attrs.accounts.github.login
              )
              // post should complete to delete instance.
              request.post(deleteOptions, function (err, res, body) {
                if (err) { return countCb.next(err) }
                expect(res.statusCode).to.equal(201)
                expect(body.length).to.equal(1)
                countCb.next()
              })
            })

            // post to kick off build.
            request.post(options, function (err, res, cvIds) {
              if (err) { return done(err) }
              expect(res.statusCode).to.equal(200)
              expect(cvIds).to.exist()
              expect(cvIds).to.be.an.array()
              expect(cvIds).to.have.length(1)
              sinon.assert.calledOnce(UserWhitelist.findOne)
              sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: sinon.match.string })
              contextCount(cvIds[0])
            })
          })
        })
      })
    })

    describe('autodeploy', function () {
      var successStub
      var slackStub
      beforeEach(function (done) {
        ctx.originalAutoForking = process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH
        process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = 'true'
        successStub = sinon.stub(PullRequest.prototype, 'deploymentSucceeded')
        slackStub = sinon.stub(Slack.prototype, 'notifyOnAutoDeploy')
        done()
      })
      afterEach(function (done) {
        process.env.ENABLE_AUTOFORK_ON_BRANCH_PUSH = ctx.originalAutoForking
        slackStub.restore()
        successStub.restore()
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
          var settings = {
            owner: {
              github: user.attrs.accounts.github.id
            }
          }
          user.createSetting({json: settings}, function (err, body) {
            if (err) { return done(err) }
            expect(body._id).to.exist()
            ctx.settingsId = body._id
            done()
          })
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

      describe('with two instances', function () {
        beforeEach(function (done) {
          var count = createCount(2, done)
          ctx.instance2 = ctx.user.copyInstance(ctx.instance.attrs.shortHash, {}, count.next)
          primus.expectActionCount('start', 1, count.next)
        })

        it('should redeploy two instances with new build', function (done) {
          require('./fixtures/mocks/docker/build-logs')()
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

          require('./fixtures/mocks/github/users-username')(user.id, username)
          require('./fixtures/mocks/github/user')(username)
          // wait for container create worker to finish
          primus.expectActionCount('start', 2, function () {
            var expected = {
              'contextVersion.build.started': exists,
              'contextVersion.build.completed': exists,
              'contextVersion.build.duration': exists,
              'contextVersion.build.triggeredBy.github': exists,
              'contextVersion.appCodeVersions[0].lowerRepo': options.json.repository.full_name.toLowerCase(),
              'contextVersion.appCodeVersions[0].commit': options.json.head_commit.id,
              'contextVersion.appCodeVersions[0].branch': data.branch,
              'contextVersion.build.triggeredAction.manual': false,
              'contextVersion.build.triggeredAction.appCodeVersion.repo': options.json.repository.full_name,
              'contextVersion.build.triggeredAction.appCodeVersion.commit': options.json.head_commit.id
            }
            expect(successStub.calledTwice).to.equal(true)
            expect(slackStub.calledOnce).to.equal(true)
            expect(slackStub.calledWith(sinon.match.object, sinon.match.array)).to.equal(true)
            ctx.instance.fetch(expects.success(200, expected, function (err) {
              if (err) { return done(err) }
              ctx.instance2.fetch(expects.success(200, expected, function () {
                sinon.assert.calledOnce(UserWhitelist.findOne)
                sinon.assert.calledWith(UserWhitelist.findOne, { lowerName: sinon.match.string })
                done()
              }))
            }))
          })
          request.post(options, function (err, res, cvIds) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(cvIds).to.exist()
            expect(cvIds).to.be.an.array()
            expect(cvIds).to.have.length(2)
            finishAllIncompleteVersions()
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

function finishContextVersions (numberOfCvs, callback) {
  var contextVersions = []

  var count = createCount(1 + numberOfCvs, function (err) {
    if (err) { return callback(err) }
    ContextVersion.find({ _id: { $in: contextVersions } }, function (err, cvs) {
      if (err) { return callback(err) }
      cvs.forEach(function (cv) {
        dockerMockEvents.emitBuildComplete(cv)
      })
      callback()
    })
  })

  primus.expectActionCount('build_running', numberOfCvs, function () { count.next() })

  return function watchVersion (contextVersionId) {
    contextVersions.push(contextVersionId)
    count.next()
  }
}
