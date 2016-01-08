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
var OnInstanceContainerDie = require('workers/on-instance-container-die')
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
var sinon = require('sinon')
var rabbitMQ = require('models/rabbitmq')

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
  beforeEach(function (done) {
    sinon.stub(OnInstanceContainerDie.prototype, 'handle').yieldsAsync()
    done()
  })
  afterEach(function (done) {
    OnInstanceContainerDie.prototype.handle.restore()
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

    it('should return message that we cannot handle tags events', function (done) {
      var options = hooks().push
      options.json.ref = 'refs/tags/v1'
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(202)
        expect(body).to.equal("Cannot handle tags' related events")
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
        done()
      })
    })
  })

  describe('wrong protocol: use https', function () {
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_GITHUB_HOOKS
      process.env.ASSERT_HTTPS = 'true'
      process.env.ENABLE_GITHUB_HOOKS = 'true'
      done()
    })
    afterEach(function (done) {
      process.env.ASSERT_HTTPS = 'false'
      process.env.ENABLE_GITHUB_HOOKS = ctx.originalBuildsOnPushSetting
      done()
    })

    it('should return message that http is not supported', function (done) {
      var options = hooks().issue_comment
      request.post(options, function (err, res, body) {
        if (err) { return done(err) }
        expect(res.statusCode).to.equal(301)
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
        done()
      })
    })

    it('should return 202 if there is neither autoDeploy nor autoLaunch is needed',
      function (done) {
        var data = {
          branch: 'some-branch',
          repo: 'some-repo',
          ownerId: 3217371238,
          owner: 'anton'
        }
        var options = hooks(data).push
        request.post(options, function (err, res, body) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(202)
          expect(body).to.equal('Nothing to deploy or fork')
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
          require('./fixtures/mocks/docker/build-logs')()
          // emulate instance deploy event
          var acv = ctx.contextVersion.attrs.appCodeVersions[0]
          var data = {
            branch: 'feature-1',
            repo: acv.repo,
            ownerId: 1987,
            owner: 'anton'
          }
          var options = hooks(data).push
          // wait for container create worker to finish
          primus.expectActionCount('start', 1, function () {
            // restore what we stubbed
            expect(successStub.calledOnce).to.equal(true)
            expect(slackStub.calledOnce).to.equal(true)
            expect(slackStub.calledWith(sinon.match.object, sinon.match.object)).to.equal(true)
            var forkedInstance = slackStub.args[0][1]
            expect(forkedInstance.name).to.equal('feature-1-' + ctx.instance.attrs.name)
            done()
          })
          request.post(options, function (err, res, cvIds) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(cvIds).to.exist()
            expect(cvIds).to.be.an.array()
            expect(cvIds).to.have.length(1)
            finishAllIncompleteVersions()
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
            // wait for container create worker to finish
            primus.expectActionCount('start', 1, function () {
              sinon.stub(rabbitMQ, 'deleteInstance', function () {
                countCb.next()
              })
              expect(slackStub.calledOnce).to.equal(true)
              expect(slackStub.calledWith(sinon.match.object, sinon.match.object)).to.equal(true)
              var deleteOptions = hooks(data).push
              deleteOptions.json.deleted = true
              require('./fixtures/mocks/github/user-id')(ctx.user.attrs.accounts.github.id,
                ctx.user.attrs.accounts.github.login)
              require('./fixtures/mocks/github/user-id')(ctx.user.attrs.accounts.github.id,
                ctx.user.attrs.accounts.github.login)
              request.post(deleteOptions, function (err, res, body) {
                if (err) { return done(err) }
                expect(res.statusCode).to.equal(201)
                expect(body.length).to.equal(1)
                countCb.next()
              })
            })
            request.post(options, function (err, res, cvIds) {
              if (err) { return done(err) }
              expect(res.statusCode).to.equal(200)
              expect(cvIds).to.exist()
              expect(cvIds).to.be.an.array()
              expect(cvIds).to.have.length(1)
              finishAllIncompleteVersions()
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
            done()
          })
        })
      })

      it('should redeploy two instances with new build', function (done) {
        require('./fixtures/mocks/docker/build-logs')()
        ctx.instance2 = ctx.user.copyInstance(ctx.instance.attrs.shortHash, {}, function (err) {
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
