'use strict'

var Code = require('code')
var Lab = require('lab')
var clone = require('101/clone')
var createCount = require('callback-count')
var exists = require('101/exists')
var noop = require('101/noop')
var randStr = require('randomstring').generate
var uuid = require('uuid')

var Build = require('models/mongo/build')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var dockerMockEvents = require('../../fixtures/docker-mock-events')
var expects = require('../../fixtures/expects')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')

var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('POST /instances', function () {
  var ctx = {}

  before(dock.start.bind(ctx))
  before(api.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))

  describe('POST', function () {
    describe('with unbuilt build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.build = build
          ctx.user = user
          done(err)
        })
      })

      it('should error if the build has unbuilt versions', function (done) {
        var json = { build: ctx.build.id(), name: randStr(5) }
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/user')(ctx.user)
        ctx.user.createInstance({ json: json }, expects.error(400, /been started/, done))
      })
    })

    describe('with started build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, contextVersion, context, build, user) {
          ctx.build = build
          ctx.user = user
          ctx.cv = contextVersion
          done(err)
        })
      })
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
      })

      describe('user owned', function () {
        describe('check messenger', function () {
          beforeEach(function (done) {
            multi.buildTheBuild(ctx.user, ctx.build, ctx.user.attrs.accounts.github.id, done)
          })

          it('should emit post and deploy events', function (done) {
            var countDown = createCount(3, done)
            var expected = {
              shortHash: exists,
              'createdBy.github': ctx.user.attrs.accounts.github.id,
              build: exists,
              name: exists,
              'owner.github': ctx.user.attrs.accounts.github.id,
              contextVersions: exists
            }

            var json = { build: ctx.build.id(), name: randStr(5) }
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)

            primus.expectAction('post', expected, countDown.next)
            primus.expectAction('start', expected, countDown.next)
            ctx.user.createInstance({ json: json }, function (err) {
              if (err) { return countDown.next(err) }
              primus.onceVersionComplete(ctx.cv.id(), function (/* data */) {
                countDown.next()
              })

              dockerMockEvents.emitBuildComplete(ctx.cv)
            })
          })
        })
        it('should create a new instance', function (done) {
          var json = { build: ctx.build.id(), name: randStr(5) }
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            'build._id': ctx.build.id(),
            name: exists,
            'owner.github': ctx.user.attrs.accounts.github.id,
            contextVersions: exists,
            'contextVersions[0]._id': ctx.cv.id(),
            'contextVersions[0].appCodeVersions[0]._id': ctx.cv.json().appCodeVersions[0]._id
          }
          require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv)

          var countDown = createCount(3, done)
          primus.expectActionCount('build_running', 1, function () {
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            primus.expectAction('start', expected, countDown.next)

            ctx.user.createInstance({ json: json }, function (err) {
              countDown.next(err)
              dockerMockEvents.emitBuildComplete(ctx.cv)
            })
          })
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.build.build({ message: uuid() }, countDown.next)
        })

        it('should deploy the instance after the build finishes', function (done) {
          var json = { build: ctx.build.id(), name: randStr(5), masterPod: true }
          require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv)
          require('../../fixtures/mocks/github/user')(ctx.user)
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) { return done(err) }
            require('../../fixtures/mocks/github/user')(ctx.user)
            primus.expectAction('start', {}, fetchInstanceAndAssertHosts)
            var instance = ctx.user.createInstance({ json: json }, function (err) {
              if (err) { return done(err) }
              dockerMockEvents.emitBuildComplete(ctx.cv)
            })
            function fetchInstanceAndAssertHosts (err) {
              if (err) { return done(err) }
              instance.fetch(function (err) {
                if (err) { return done(err) }
                expect(instance.attrs.containers[0]).to.exist()
                expects.updatedHosts(
                  ctx.user, instance, done)
              })
            }
          })
        })
        describe('without a started context version', function () {
          beforeEach(function (done) {
            var count = createCount(2, done)
            Build.findById(ctx.build.id(), function (err, build) {
              if (err) { return done(err) }
              build.setInProgress(ctx.user, count.next)
              build.update({contextVersion: ctx.cv.id()}, count.next)
            })
          })
          it('should not create a new instance', function (done) {
            var json = { build: ctx.build.id(), name: randStr(5) }
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.user.createInstance({ json: json }, expects.error(400, done))
          })
        })
      })

      describe('org owned', function () {
        beforeEach(function (done) {
          ctx.orgId = 1001
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          multi.createContextVersion(ctx.orgId,
            function (err, contextVersion, context, build, user) {
              ctx.build = build
              ctx.user = user
              ctx.cv = contextVersion
              done(err)
            })
        })
        beforeEach(function (done) {
          primus.joinOrgRoom(ctx.orgId, done)
        })

        it('should create a new instance', function (done) {
          var json = { build: ctx.build.id(), name: randStr(5) }
          var expected = {
            shortHash: exists,
            'createdBy.github': ctx.user.attrs.accounts.github.id,
            'build._id': ctx.build.id(),
            name: exists,
            'owner.github': ctx.orgId
          }
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
          require('../../fixtures/mocks/github/user')(ctx.user)
          require('../../fixtures/mocks/github/repos-username-repo-branches-branch')(ctx.cv)
          ctx.build.build({ message: uuid() }, function (err) {
            if (err) { return done(err) }
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
            require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, 'Runnable')
            require('../../fixtures/mocks/github/user')(ctx.user)
            var countDown = createCount(2, done)
            var next = countDown.next
            primus.expectAction('start', next)
            ctx.user.createInstance({ json: json }, function (err, body, code, res) {
              if (err) { return next(err) }
              dockerMockEvents.emitBuildComplete(ctx.cv)
              expects.success(201, expected, next)(err, body, code, res)
            })
          })
        })
      })
    })

    describe('from built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user) {
          ctx.build = build
          ctx.user = user
          done(err)
        })
      })

      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
      })
      var requiredProjectKeys = ['build']
      beforeEach(function (done) {
        ctx.json = {
          build: ctx.build.id()
        }
        done()
      })

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing ' + missingBodyKey, function (done) {
          var json = {
            name: randStr(5),
            build: ctx.build.id()
          }
          var incompleteBody = clone(json)
          delete incompleteBody[missingBodyKey]
          var errorMsg = new RegExp(missingBodyKey + '.*' + 'is required')

          ctx.user.createInstance(incompleteBody, expects.error(400, errorMsg, done))
        })
      })
      describe('with built versions', function () {
        beforeEach(function (done) {
          primus.joinOrgRoom(ctx.user.attrs.accounts.github.id, done)
        })
        it('should default the name to a short hash', function (done) {
          var json = {
            build: ctx.build.id()
          }
          var expected = {
            shortHash: exists,
            name: exists,
            _id: exists
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          require('../../fixtures/mocks/github/user')(ctx.user)
          var countDown = createCount(2, done)
          var next = countDown.next
          primus.expectAction('start', next)
          var instance = ctx.user.createInstance(json,
            expects.success(201, expected, function (err, instanceData) {
              if (err) { return next(err) }
              expect(instanceData.name).to.equal('Instance1')
              expect(instanceData.shortHash).to.equal(instance.attrs.shortHash)
              expect(/[a-z0-9]+/.test(instanceData.shortHash)).to.equal(true)
              next()
            }))
        })
        it('should create an instance, and start it', function (done) {
          var json = {
            name: randStr(5),
            build: ctx.build.id(),
            masterPod: true
          }
          var expected = {
            _id: exists,
            name: json.name,
            'owner.github': ctx.user.json().accounts.github.id,
            'owner.username': ctx.user.json().accounts.github.login,
            public: false,
            'build._id': ctx.build.id(),
            containers: exists,
            'containers[0]': exists
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          require('../../fixtures/mocks/github/user')(ctx.user)
          var instance = ctx.user.createInstance(json,
            expects.success(201, {}, function (err) {
              if (err) { return done(err) }
            }))
          primus.expectAction('start', expected, function () {
            instance.fetch(function () {
              expects.updatedHosts(
                ctx.user, instance, done)
            })
          })
        })
        describe('body.env', function () {
          it('should create an instance, with ENV', function (done) {
            var json = {
              name: randStr(5),
              build: ctx.build.id(),
              env: [
                'ONE=1',
                'TWO=2'
              ]
            }
            var expected = {
              _id: exists,
              name: json.name,
              env: json.env,
              owner: {
                github: ctx.user.json().accounts.github.id,
                gravatar: ctx.user.json().accounts.github.avatar_url,
                username: ctx.user.json().accounts.github.login
              },
              public: false,
              'build._id': ctx.build.id(),
              containers: exists,
              'containers[0]': exists
            }
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.user.createInstance(json,
              expects.success(201, {}, noop))
            primus.expectAction('start', expected, done)
          })
          it('should error if body.env is not an array of strings', function (done) {
            var json = {
              name: randStr(5),
              build: ctx.build.id(),
              env: [{
                iCauseError: true
              }]
            }
            ctx.user.createInstance(json,
              expects.errorStatus(400, /"env" should match/, done))
          })
          it('should filter empty/whitespace-only strings from env array', function (done) {
            var json = {
              name: randStr(5),
              build: ctx.build.id(),
              env: [
                '', ' ', 'ONE=1'
              ]
            }
            var expected = {
              _id: exists,
              name: json.name,
              env: ['ONE=1'],
              owner: {
                github: ctx.user.json().accounts.github.id,
                gravatar: ctx.user.json().accounts.github.avatar_url,
                username: ctx.user.json().accounts.github.login
              },
              public: false,
              'build._id': ctx.build.id(),
              containers: exists,
              'containers[0]': exists
            }
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.user.createInstance(json,
              expects.success(201, {}, noop))
            primus.expectAction('start', expected, done)
          })
          it('should error if body.env contains an invalid variable', function (done) {
            var json = {
              name: randStr(5),
              build: ctx.build.id(),
              env: [
                'ONE=1',
                '$@#4123TWO=2'
              ]
            }
            require('../../fixtures/mocks/github/user')(ctx.user)
            require('../../fixtures/mocks/github/user')(ctx.user)
            ctx.user.createInstance(json,
              expects.errorStatus(400, /should match/, done))
          })
        })
        describe('unique names (by owner) and hashes', function () {
          beforeEach(function (done) {
            multi.createBuiltBuild(ctx.orgId, function (err, build, user) {
              ctx.build2 = build
              ctx.user2 = user
              done(err)
            })
          })
          it('should generate unique names (by owner) and hashes an instance', function (done) {
            var body = {
              build: ctx.build.id()
            }
            var expected = {
              _id: exists,
              name: 'Instance1',
              owner: {
                github: ctx.user.json().accounts.github.id,
                gravatar: ctx.user.json().accounts.github.avatar_url,
                username: ctx.user.json().accounts.github.login
              },
              public: false,
              'build._id': ctx.build.id(),
              containers: exists,
              shortHash: exists
            }
            createInstanceWith(ctx.user, body, expected, function (err, res1) {
              if (err) { return done(err) }
              expected.name = 'Instance2'
              expected.shortHash = function (shortHash) {
                expect(shortHash).to.not.equal(res1.shortHash)
                return true
              }
              createInstanceWith(ctx.user, body, expected, function (err, res2) {
                if (err) { return done(err) }
                var expected2 = {
                  _id: exists,
                  name: 'Instance1',
                  owner: {
                    github: ctx.user2.json().accounts.github.id,
                    gravatar: ctx.user2.json().accounts.github.avatar_url,
                    username: ctx.user2.json().accounts.github.login
                  },
                  public: false,
                  'build._id': ctx.build2.id(),
                  containers: exists,
                  shortHash: function (shortHash) {
                    expect(shortHash)
                      .to.not.equal(res1.shortHash)
                      .to.not.equal(res2.shortHash)
                    return true
                  }
                }
                var body2 = {
                  build: ctx.build2.id()
                }
                createInstanceWith(ctx.user2, body2, expected2, done)
              })
            })
            function createInstanceWith (user, body, expected, cb) {
              var next = createCount(2, complete).next
              primus.expectAction('start', next)
              require('../../fixtures/mocks/github/user')(user)
              require('../../fixtures/mocks/github/user')(user)
              var instance = user.createInstance(body, expects.success(201, expected, next))
              function complete (err) {
                cb(err, instance && instance.toJSON())
              }
            }
          })
        })
      })
      describe('from different owner', function () {
        beforeEach(function (done) {
          var orgInfo = require('../../fixtures/mocks/github/user-orgs')()
          ctx.orgId = orgInfo.orgId
          ctx.orgName = orgInfo.orgName
          multi.createBuiltBuild(ctx.orgId, function (err, build, user) {
            ctx.build2 = build
            ctx.user2 = user
            done(err)
          })
        })
        it('should default the name to a short hash', function (done) {
          var json = {
            build: ctx.build2.id(),
            owner: {
              github: ctx.user.attrs.accounts.github.id,
              gravatar: ctx.user.json().accounts.github.avatar_url,
              username: ctx.user.attrs.accounts.github.login
            }
          }
          require('../../fixtures/mocks/github/user')(ctx.user)
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName)
          ctx.user.createInstance(json,
            expects.errorStatus(400, /owner must match/, done))
        })
      })
    })

    describe('Create instance from parent instance', function () {
      beforeEach(function (done) {
        multi.createAndTailInstance(primus, function (err, instance, build, user) {
          ctx.instance = instance
          ctx.build = build
          ctx.user = user
          done(err)
        })
      })

      it('should have the parent instance set in the new one', function (done) {
        var json = {
          build: ctx.build.id(),
          parent: ctx.instance.attrs.shortHash
        }
        var expected = {
          _id: exists,
          name: 'Instance1', // uuid is used in multi.createInstance
          owner: {
            github: ctx.user.json().accounts.github.id,
            gravatar: ctx.user.json().accounts.github.avatar_url,
            username: ctx.user.json().accounts.github.login
          },
          public: false,
          'build._id': ctx.build.id(),
          containers: exists,
          parent: ctx.instance.attrs.shortHash,
          shortHash: exists
        }
        require('../../fixtures/mocks/github/user')(ctx.user)
        primus.expectAction('start', expected, done)
        ctx.user.createInstance(json, expects.success(201, expected, noop))
      })
    })
  })
})
