/**
 * @module test/bdd-deploy-instance
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var async = require('async')
var createCount = require('callback-count')
var find = require('101/find')
var hasKeypaths = require('101/has-keypaths')
var pick = require('101/pick')

var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var expects = require('./fixtures/expects')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var primus = require('./fixtures/primus')

var sinon = require('sinon')
var rabbitMQ = require('models/rabbitmq')
var uuid = require('uuid')

describe('BDD - Create Build and Deploy Instance', function () {
  var ctx = {}
  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(primus.connect)
  after(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  before(require('./fixtures/mocks/api-client').setup)
  after(require('./fixtures/mocks/api-client').clean)
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))

  before(function (done) {
    // prevent worker to be created
    sinon.stub(rabbitMQ, 'deleteInstance', function () {})
    done()
  })
  after(function (done) {
    rabbitMQ.deleteInstance.restore()
    done()
  })
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return [{
        id: 11111,
        username: 'Runnable'
      }]
    })
  )
  afterEach(mockGetUserById.stubAfter)
  describe('create a cv to test dudupe logic with', function () {
    beforeEach(function (done) {
      multi.createAndTailInstance(primus, function (err, instance, build, user, modelsArr) {
        if (err) { return done(err) }
        ctx.instance = instance
        ctx.build = build
        ctx.user = user
        ctx.contextVersion = modelsArr[0]
        ctx.context = modelsArr[1]
        ctx.oldDockerContainer = ctx.instance.attrs.containers[0].dockerContainer
        done()
      })
    })

    describe('duplicate build', function () {
      // 1
      it('should deploy an instance deduped context versions', function (done) {
        require('./fixtures/mocks/github/user-orgs')(11111, 'Runnable')

        var count = createCount(2, done)
        primus.expectAction('start', count.next)

        async.waterfall([
          createVersion,
          addAppCodeVersions,
          createBuild,
          buildBuild
        ], function (err, newBuild) {
          if (err) { return done(err) }
          expect(ctx.instance.build._id).to.equal(newBuild._id)
          expects.updatedHosts(ctx.user, ctx.instance, count.next)
        })
        function createVersion (cb) {
          var newVersion = ctx.context.createVersion({
            infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
          }, function (err) {
            cb(err, newVersion)
          })
        }
        function addAppCodeVersions (newVersion, cb) {
          async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
            var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit'])
            var username = body.repo.split('/')[0]
            var repoName = body.repo.split('/')[1]
            require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName)
            require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName)
            require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true)
            newVersion.appCodeVersions.create(body, cb)
          }, function (err) {
            cb(err, newVersion)
          })
        }
        function createBuild (newVersion, cb) {
          var newBuild = ctx.user.createBuild({
            contextVersions: [ newVersion.id() ]
          }, function (err) {
            cb(err, newBuild)
          })
        }
        function buildBuild (newBuild, cb) {
          var count2 = createCount(2, function (err) {
            cb(err, newBuild)
          })
          var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next)
          dispatch.on('started', function () {
            // expect dedupe to work
            expect(newBuild.attrs.contexts).to.deep.equal(ctx.build.attrs.contexts)
            expect(newBuild.attrs.contextVersions).to.deep.equal(ctx.build.attrs.contextVersions)
            updateInstanceWithBuild(newBuild, function (err) {
              count2.next(err)
            })
          })
        }
        function updateInstanceWithBuild (newBuild, cb) {
          require('./fixtures/mocks/github/user')(ctx.user)
          require('./fixtures/mocks/github/user')(ctx.user)
          require('./fixtures/mocks/github/user')(ctx.user)
          var count = createCount(cb)
          primus.expectAction('start', count.inc().next)
          ctx.instance.update({
            build: newBuild.id()
          }, count.inc().next)
        }
      })
    })
    describe('modified build', function () {
      describe('appCodeVersions', function () {
        describe('change commit', function () {
          // 2
          it('should deploy an instance with new context versions', function (done) {
            require('./fixtures/mocks/github/user-orgs')(11111, 'Runnable')

            async.waterfall([
              createVersion,
              addAppCodeVersions,
              createBuild,
              buildBuild
            ], function (err, newBuild) {
              if (err) { return done(err) }
              expect(ctx.instance.build._id).to.equal(newBuild._id)
              expects.updatedHosts(ctx.user, ctx.instance, done)
            })
            function createVersion (cb) {
              var newVersion = ctx.context.createVersion({
                infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
              }, function (err) {
                cb(err, newVersion)
              })
            }
            function addAppCodeVersions (newVersion, cb) {
              async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
                var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit'])
                body.commit = body.commit.replace(/f/g, 'e')
                var username = body.repo.split('/')[0]
                var repoName = body.repo.split('/')[1]
                require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName)
                require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName)
                require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true)
                newVersion.appCodeVersions.create(body, cb)
              }, function (err) {
                cb(err, newVersion)
              })
            }
            function createBuild (newVersion, cb) {
              var newBuild = ctx.user.createBuild({
                contextVersions: [ newVersion.id() ]
              }, function (err) {
                cb(err, newBuild)
              })
            }
            function buildBuild (newBuild, cb) {
              var count2 = createCount(2, function (err) {
                cb(err, newBuild)
              })
              var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next)
              dispatch.on('started', function () {
                expect(newBuild.attrs.contexts).to.deep.equal(ctx.build.attrs.contexts)
                expect(newBuild.attrs.contextVersions).to.not.deep.equal(ctx.build.attrs.contextVersions)
                updateInstanceWithBuild(newBuild, function (err) {
                  count2.next(err)
                })
              })
            }
            function updateInstanceWithBuild (newBuild, cb) {
              require('./fixtures/mocks/github/user')(ctx.user)
              require('./fixtures/mocks/github/user')(ctx.user)
              require('./fixtures/mocks/github/user')(ctx.user)
              require('./fixtures/mocks/github/user-orgs')(11111, 'Runnable')
              var count = createCount(cb)
              primus.expectAction('start', count.inc().next)
              ctx.instance.update({
                build: newBuild.id()
              }, count.inc().next)
            }
          })
        })
        describe('change branch', function () {
          // 3
          it('should deploy an instance with new context versions (with same docker image)', function (done) {
            async.waterfall([
              createVersion,
              addAppCodeVersions,
              createBuild,
              buildBuild
            ], function (err, newBuild) {
              if (err) { return done(err) }
              expect(ctx.instance.build._id).to.equal(newBuild._id)
              expects.updatedHosts(ctx.user, ctx.instance, done)
            })
            function createVersion (cb) {
              var newVersion = ctx.context.createVersion({
                infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
              }, function (err) {
                cb(err, newVersion)
              })
            }
            function addAppCodeVersions (newVersion, cb) {
              async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
                var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit'])
                body.branch = 'otherBranch'
                var username = body.repo.split('/')[0]
                var repoName = body.repo.split('/')[1]
                require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName)
                require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName)
                require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true)
                newVersion.appCodeVersions.create(body, cb)
              }, function (err) {
                cb(err, newVersion)
              })
            }
            function createBuild (newVersion, cb) {
              var newBuild = ctx.user.createBuild({
                contextVersions: [ newVersion.id() ]
              }, function (err) {
                cb(err, newBuild)
              })
            }
            function buildBuild (newBuild, cb) {
              var count2 = createCount(2, function (err) {
                cb(err, newBuild)
              })
              var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next)
              dispatch.on('started', function () {
                expect(newBuild.attrs.contexts).to.deep.equal(ctx.build.attrs.contexts)
                expect(newBuild.attrs.contextVersions).to.not.deep.equal(ctx.build.attrs.contextVersions)
                expectVersionBuildsToBeEql(ctx.user, newBuild, ctx.build, function (err) {
                  if (err) { return count2.next(err) }
                  updateInstanceWithBuild(newBuild, function (err) {
                    count2.next(err)
                  })
                })
              })
            }
            function updateInstanceWithBuild (newBuild, cb) {
              require('./fixtures/mocks/github/user')(ctx.user)
              require('./fixtures/mocks/github/user')(ctx.user)
              require('./fixtures/mocks/github/user')(ctx.user)
              var count = createCount(cb)
              primus.expectAction('start', count.inc().next)
              ctx.instance.update({
                build: newBuild.id()
              }, count.inc().next)
            }
          })
        })
        function expectVersionBuildsToBeEql (user, build1, build2, cb) {
          var cV1 = build1.contextVersions.models[0]
          var cV2 = build2.contextVersions.models[0]
          var count = createCount(2, function (err) {
            if (err) { return cb(err) }
            expect(cV1.attrs.build._id).to.deep.equal(cV2.attrs.build._id)
            expect(cV1.attrs.build.containerStarted).to.deep.equal(cV2.attrs.build.containerStarted)
            expect(cV1.attrs.build.completed).to.deep.equal(cV2.attrs.build.completed)
            cb()
          })
          require('./fixtures/mocks/github/user')(user)
          require('./fixtures/mocks/github/user')(user)
          cV1.fetch(count.next)
          cV2.fetch(count.next)
        }
      })
      describe('edit dockerfile (infraCodeVersion)', function () {
        // 4
        it('should deploy an instance with new context versions', function (done) {
          async.waterfall([
            createVersion,
            modifyDockerfile,
            addAppCodeVersions,
            createBuild,
            buildBuild
          ], function (err, newBuild) {
            if (err) { return done(err) }
            expect(ctx.instance.build._id).to.equal(newBuild._id)
            expects.updatedHosts(ctx.user, ctx.instance, done)
          })
          function createVersion (cb) {
            var newVersion = ctx.context.createVersion({
              infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
            }, function (err) {
              cb(err, newVersion)
            })
          }
          function modifyDockerfile (newVersion, cb) {
            var contents = newVersion.rootDir.contents
            contents.fetch(function (err) {
              if (err) { return cb(err) }
              var dockerfile = find(contents.models, hasKeypaths({ 'attrs.name': 'Dockerfile' }))
              require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/Dockerfile')
              dockerfile.update({
                json: {
                  body: 'FROM dockerfile/nodejs'
                }
              }, function (err) {
                cb(err, newVersion)
              })
            })
          }
          function addAppCodeVersions (newVersion, cb) {
            async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
              var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit'])
              var username = body.repo.split('/')[0]
              var repoName = body.repo.split('/')[1]
              require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName)
              require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName)
              require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true)
              newVersion.appCodeVersions.create(body, cb)
            }, function (err) {
              cb(err, newVersion)
            })
          }
          function createBuild (newVersion, cb) {
            var newBuild = ctx.user.createBuild({
              contextVersions: [ newVersion.id() ]
            }, function (err) {
              cb(err, newBuild)
            })
          }
          function buildBuild (newBuild, cb) {
            var count2 = createCount(2, function (err) {
              cb(err, newBuild)
            })
            var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next)
            dispatch.on('started', function () {
              expect(newBuild.attrs.contexts).to.deep.equal(ctx.build.attrs.contexts)
              expect(newBuild.attrs.contextVersions).to.not.deep.equal(ctx.build.attrs.contextVersions)
              updateInstanceWithBuild(newBuild, function (err) {
                count2.next(err)
              })
            })
          }
          function updateInstanceWithBuild (newBuild, cb) {
            require('./fixtures/mocks/github/user')(ctx.user)
            require('./fixtures/mocks/github/user')(ctx.user)
            require('./fixtures/mocks/github/user')(ctx.user)
            var count = createCount(cb)
            primus.expectAction('start', count.inc().next)
            ctx.instance.update({
              build: newBuild.id()
            }, count.inc().next)
          }
        })
      })
    })
  })

  describe('advanced property', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, contextVersion, context, build, user) {
        if (err) { return done(err) }
        ctx.context = context
        ctx.contextVersion = contextVersion
        ctx.build = build
        ctx.user = user
        done()
      })
    })
    describe('duplicate cv w/ advanced:true with cv w/ advance:false', function () {
      beforeEach(function (done) {
        multi.buildTheBuild(ctx.user, ctx.build, done)
      })
      beforeEach(function (done) {
        ctx.instance = ctx.user.createInstance({
          build: ctx.build.id(),
          masterPod: true,
          name: uuid()
        }, done)
      })
      // 5
      it('should deploy an instance with new context versions', function (done) {
        async.waterfall([
          createVersion,
          addAppCodeVersions,
          patchVersion,
          createBuild,
          buildBuild
        ], function (err, newBuild) {
          if (err) { return done(err) }
          expect(ctx.instance.build._id).to.equal(newBuild._id)
          expects.updatedHosts(ctx.user, ctx.instance, done)
        })
        function createVersion (cb) {
          var newVersion = ctx.context.createVersion({
            infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
          }, function (err) {
            cb(err, newVersion)
          })
        }
        function addAppCodeVersions (newVersion, cb) {
          async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
            var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit'])
            var username = body.repo.split('/')[0]
            var repoName = body.repo.split('/')[1]
            require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName)
            require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName)
            require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true)
            newVersion.appCodeVersions.create(body, cb)
          }, function (err) {
            cb(err, newVersion)
          })
        }
        function patchVersion (newVersion, cb) {
          newVersion.update({ advanced: true }, function (err) {
            cb(err, newVersion)
          })
        }
        function createBuild (newVersion, cb) {
          var newBuild = ctx.user.createBuild({
            contextVersions: [ newVersion.id() ]
          }, function (err) {
            cb(err, newVersion, newBuild)
          })
        }
        function buildBuild (newVersion, newBuild, cb) {
          var count2 = createCount(2, function (err) {
            cb(err, newBuild)
          })
          var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next)
          dispatch.on('started', function () {
            // expect dedupe to work
            expect(newBuild.attrs.contexts).to.deep.equal(ctx.build.attrs.contexts)
            expect(newBuild.attrs.contextVersions).to.deep.equal([ newVersion.id() ])
            updateInstanceWithBuild(newBuild, function (err) {
              count2.next(err)
            })
          })
        }
        function updateInstanceWithBuild (newBuild, cb) {
          require('./fixtures/mocks/github/user')(ctx.user)
          require('./fixtures/mocks/github/user')(ctx.user)
          require('./fixtures/mocks/github/user')(ctx.user)
          var count = createCount(cb)
          primus.expectAction('start', count.inc().next)
          ctx.instance.update({
            build: newBuild.id()
          }, count.inc().next)
        }
      })
    })
    describe('duplicate cv w/ advanced:false with cv w/ advance:true', function () {
      beforeEach(function (done) {
        ctx.contextVersion.update({ advanced: true }, done)
      })
      beforeEach(function (done) {
        multi.buildTheBuild(ctx.user, ctx.build, done)
      })
      beforeEach(function (done) {
        ctx.instance = ctx.user.createInstance({
          build: ctx.build.id(),
          masterPod: true,
          name: uuid()
        }, done)
      })
      // 6
      it('should deploy an instance with new context versions', function (done) {
        async.waterfall([
          createVersion,
          addAppCodeVersions,
          patchVersion,
          createBuild,
          buildBuild
        ], function (err, newBuild) {
          if (err) { return done(err) }
          expect(ctx.instance.build._id).to.equal(newBuild._id)
          expects.updatedHosts(ctx.user, ctx.instance, done)
        })
        function createVersion (cb) {
          var newVersion = ctx.context.createVersion({
            infraCodeVersion: ctx.contextVersion.attrs.infraCodeVersion
          }, function (err) {
            cb(err, newVersion)
          })
        }
        function addAppCodeVersions (newVersion, cb) {
          async.each(ctx.contextVersion.appCodeVersions.models, function (appCodeVersion, cb) {
            var body = pick(appCodeVersion.attrs, ['repo', 'branch', 'commit'])
            var username = body.repo.split('/')[0]
            var repoName = body.repo.split('/')[1]
            require('./fixtures/mocks/github/repos-username-repo')(ctx.user, repoName)
            require('./fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, repoName)
            require('./fixtures/mocks/github/repos-keys-get')(username, repoName, true)
            newVersion.appCodeVersions.create(body, cb)
          }, function (err) {
            cb(err, newVersion)
          })
        }
        function patchVersion (newVersion, cb) {
          newVersion.update({ advanced: false }, function (err) {
            cb(err, newVersion)
          })
        }
        function createBuild (newVersion, cb) {
          var newBuild = ctx.user.createBuild({
            contextVersions: [ newVersion.id() ]
          }, function (err) {
            cb(err, newVersion, newBuild)
          })
        }
        function buildBuild (newVersion, newBuild, cb) {
          var count2 = createCount(2, function (err) {
            cb(err, newBuild)
          })
          var dispatch = multi.buildTheBuild(ctx.user, newBuild, count2.next)
          dispatch.on('started', function () {
            // expect dedupe to work
            expect(newBuild.attrs.contexts).to.deep.equal(ctx.build.attrs.contexts)
            expect(newBuild.attrs.contextVersions).to.deep.equal([ newVersion.id() ])
            updateInstanceWithBuild(newBuild, function (err) {
              count2.next(err)
            })
          })
        }
        function updateInstanceWithBuild (newBuild, cb) {
          require('./fixtures/mocks/github/user')(ctx.user)
          require('./fixtures/mocks/github/user')(ctx.user)
          require('./fixtures/mocks/github/user')(ctx.user)
          var count = createCount(cb)
          primus.expectAction('start', count.inc().next)
          ctx.instance.update({
            build: newBuild.id()
          }, count.inc().next)
        }
      })
    })
  })
})
