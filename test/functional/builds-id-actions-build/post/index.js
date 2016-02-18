'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var api = require('./../../fixtures/api-control')
var dock = require('./../../fixtures/dock')
var multi = require('./../../fixtures/multi-factory')
var expects = require('./../../fixtures/expects')
var dockerMockEvents = require('./../../fixtures/docker-mock-events')
var primus = require('./../../fixtures/primus')
var createCount = require('callback-count')
var exists = require('101/exists')
var equals = require('101/equals')
var last = require('101/last')
var uuid = require('uuid')
var mockGetUserById = require('./../../fixtures/mocks/github/getByUserId')

describe('Build - /builds/:id/actions/build', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(require('./../../fixtures/mocks/github/login'))
  beforeEach(require('./../../fixtures/mocks/github/login'))
  beforeEach(primus.connect)

  afterEach(primus.disconnect)
  afterEach(require('./../../fixtures/clean-mongo').removeEverything)
  afterEach(require('./../../fixtures/clean-ctx')(ctx))
  afterEach(require('./../../fixtures/clean-nock'))
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: 11111,
        username: 'Runnable'
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

  describe('POST', function () {
    describe('unbuilt build', function () {
      beforeEach(function (done) {
        multi.createContextVersion(function (err, cv, context, build, user) {
          ctx.cv = cv
          ctx.context = context
          ctx.build = build
          ctx.user = user
          done(err)
        })
      })
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
      })

      it('should start building the build - return in-progress build', function (done) {
        require('./../../fixtures/mocks/github/user')(ctx.user)
        primus.onceVersionBuildRunning(ctx.cv.id(), function () {
          primus.onceVersionComplete(ctx.cv.id(), function (data) {

            var count = createCount(2, done)
            var buildExpected = {
              completed: exists,
              duration: exists,
              failed: equals(false)
            }
            ctx.build.fetch(expects.success(200, buildExpected, count.next))
            var versionExpected = {
              'build.message': exists,
              'build.started': exists,
              'build.completed': exists,
              'build.dockerImage': exists,
              'build.dockerTag': exists,
              'build.log': exists,
              'build.triggeredAction.manual': true
            }
            require('./../../fixtures/mocks/github/user')(ctx.user) // non owner org
            ctx.cv.fetch(expects.success(200, versionExpected, count.next))
          })

          dockerMockEvents.emitBuildComplete(ctx.cv)
        })
        ctx.build.build({message: 'hello!'}, function (err, body, code) {
          if (err) { return done(err) }

          expect(code).to.equal(201)
          expect(body).to.exist()
        })
      })
      it('copy build, then build both builds, should use same build', function (done) {
        ctx.buildCopy = ctx.build.copy(function (err) {
          if (err) {
            return done(err)
          }
          require('./../../fixtures/mocks/github/user')(ctx.user)
          ctx.build.build({message: 'hello!'}, function (err, body, code) {
            if (err) {
              return done(err)
            }
            expect(code).to.equal(201)
            expect(body).to.exist()

            primus.onceVersionBuildRunning(ctx.cv.id(), function () {
              primus.onceVersionComplete(ctx.cv.id(), function (data) {
                if (err) { return done(err) }
                var buildExpected = {
                  completed: exists,
                  duration: exists,
                  failed: equals(false)
                }
                var count = createCount(3, done)
                require('./../../fixtures/mocks/github/user')(ctx.user) // non owner org
                ctx.build.fetch(expects.success(200, buildExpected, count.next))
                require('./../../fixtures/clean-nock')(function () {})
                require('./../../fixtures/mocks/github/user')(ctx.user) // non owner org
                ctx.buildCopy.fetch(expects.success(200, buildExpected, count.next))

                var versionExpected = {
                  'build.message': exists,
                  'build.started': exists,
                  'build.completed': exists,
                  'build.dockerImage': exists,
                  'build.dockerTag': exists,
                  'build.log': exists,
                  'build.triggeredAction.manual': true
                }
                require('./../../fixtures/mocks/github/user')(ctx.user) // non owner org
                ctx.cv.fetch(expects.success(200, versionExpected, count.next))
              })

              dockerMockEvents.emitBuildComplete(ctx.cv)
            })

            require('./../../fixtures/mocks/github/user')(ctx.user)
            ctx.buildCopy.build({message: 'hello!'}, function (err, body, code) {
              expect(err).to.not.exist()
              expect(code).to.equal(201)
              expect(body).to.exist()
              expect(body.contextVersions[0]).to.equal(ctx.cv.attrs._id)
            })
          })
        })
      })
      it('copy build, then build both builds (failed), should both fail', function (done) {
        ctx.buildCopy = ctx.build.copy(function (err) {
          if (err) {
            return done(err)
          }
          require('./../../fixtures/mocks/github/user')(ctx.user)
          ctx.build.build({message: 'hello!'}, function (err, body, code) {
            if (err) {
              return done(err)
            }
            expect(code).to.equal(201)
            expect(body).to.exist()

            primus.onceVersionBuildRunning(ctx.cv.id(), function () {
              primus.onceVersionComplete(ctx.cv.id(), function () {
                var buildExpected = {
                  duration: exists,
                  failed: exists
                }

                require('./../../fixtures/mocks/github/user')(ctx.user) // non owner org
                ctx.build.fetch(expects.success(200, buildExpected, function () {
                  require('./../../fixtures/mocks/github/user')(ctx.user) // non owner org
                  ctx.buildCopy.fetch(expects.success(200, buildExpected, done))
                }))
              })

              dockerMockEvents.emitBuildComplete(ctx.cv, true)
            })

            require('./../../fixtures/mocks/github/user')(ctx.user)
            ctx.buildCopy.build({ message: 'hello!' }, function (err, body, code) {
              if (err) { return done(err) }
              expect(code).to.equal(201)
              expect(body).to.exist()
              expect(body.contextVersions[0]).to.equal(ctx.cv.attrs._id)
            })
          })
        })
      })
      it('add another appcodeversion, build, remove an appcodeversion, it should not reuse cv',
        function (done) {
          // Add a new repo to the cv
          ctx.repoName = 'Dat-middleware'
          ctx.fullRepoName = ctx.user.json().accounts.github.login + '/' + ctx.repoName
          var body = {
            repo: ctx.fullRepoName,
            branch: 'master',
            commit: uuid().replace(/-/g, '')
          }
          require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName)
          require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName)
          var username = ctx.user.attrs.accounts.github.login
          require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true)
          ctx.appCodeVersion = ctx.cv.addGithubRepo(body, function (err) {
            if (err) { return done(err) }
            // Build the build
            ctx.buildCopy = ctx.build.deepCopy(function (err) {
              if (err) { return done(err) }
              multi.buildTheBuild(ctx.user, ctx.build, function (err) {
                if (err) { return done(err) }
                dockerMockEvents.emitBuildComplete(ctx.cv)
                // Now make a copy
                var newCv = ctx.user
                  .newContext(ctx.context.id())
                  .newVersion(ctx.buildCopy.attrs.contextVersions[0])

                newCv.fetch(function (err, othercv) {
                  if (err) { return done(err) }
                  ctx.otherCv = othercv
                  // Now remove the repo
                  newCv.destroyAppCodeVersion(ctx.appCodeVersion.id(), function () {
                    if (err) { return done(err) }

                    primus.onceVersionBuildRunning(newCv.id(), function () {
                      primus.onceVersionComplete(newCv.id(), function () {
                        // Now refetch the build, and make sure the cv is different from the
                        // original ctx.build it was cloned from
                        ctx.buildCopy.fetch(function (err, build) {
                          if (err) { return done(err) }
                          expect(build.contextVersions[0]).to.not.equal(ctx.build.attrs.contextVersions[0])
                          done()
                        })
                      })

                      dockerMockEvents.emitBuildComplete(newCv)
                    })

                    // Build the build
                    require('./../../fixtures/mocks/github/user')(ctx.user)
                    ctx.buildCopy.build({message: 'hello!'}, function (err) {
                      if (err) { return done(err) }
                    })
                  })
                })
              })
            })
          })
        }
      )
      describe('errors', function () {
        it('should error if the build is already in progress', function (done) {
          require('./../../fixtures/mocks/github/user')(ctx.user)
          ctx.build.build({message: 'hello!'}, function (err) {
            if (err) { return done(err) }
            ctx.build.build({message: 'hello!'}, function (err, body, code) {
              dockerMockEvents.emitBuildComplete(ctx.cv)

              primus.onceVersionComplete(ctx.cv.id(), function () {
                expects.error(409, /Build is already in progress/, done)(err, body, code)
              })
            })
          })
        })
      })
    })
    describe('built build', function () {
      beforeEach(function (done) {
        multi.createBuiltBuild(function (err, build, user) {
          ctx.build = build
          ctx.user = user
          done(err)
        })
      })
      it('should error if the build is already built', function (done) {
        ctx.build.build({ message: 'hello!' },
          expects.error(409, /Build is already built/, done))
      })
    })
  })
})
