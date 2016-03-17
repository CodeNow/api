'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var Boom = require('dat-middleware').Boom
var isObject = require('101/is-object')
var keypather = require('keypather')()

var Context = require('models/mongo/context')
var ContextVersion = require('models/mongo/context-version')
var Github = require('models/apis/github')
var InfraCodeVersion = require('models/mongo/infra-code-version')
var User = require('models/mongo/user')
var messenger = require('socket/messenger')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)
var rabbitMQ = require('models/rabbitmq')
var uuid = require('uuid')
var Promise = require('bluebird')
require('sinon-as-promised')(Promise)

describe('Context Version: ' + moduleName, function () {
  var ctx = {}
  before(require('../../fixtures/mongo').connect)
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything)

  beforeEach(function (done) {
    ctx.mockContextVersion = {
      _id: '55d3ef733e1b620e00eb6292',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      },
      build: {
        _id: '23412312h3nk1lj2h3l1k2',
        completed: true
      }
    }
    ctx.mockContext = {
      _id: '55d3ef733e1b620e00eb6292',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      }
    }
    done()
  })

  describe('getUserContainerMemoryLimit', function () {
    var testCv
    beforeEach(function (done) {
      testCv = new ContextVersion({
        appCodeVersions: [{test: 1}]
      })
      sinon.stub(ContextVersion, 'getMainAppCodeVersion')
      done()
    })

    afterEach(function (done) {
      ContextVersion.getMainAppCodeVersion.restore()
      done()
    })

    it('should get overriden memory limit', function (done) {
      testCv.userContainerMemoryInBytes = 512000002
      var out = testCv.getUserContainerMemoryLimit()
      expect(out).to.equal(testCv.userContainerMemoryInBytes)
      sinon.assert.notCalled(ContextVersion.getMainAppCodeVersion)
      done()
    })

    it('should get repo memory limit', function (done) {
      ContextVersion.getMainAppCodeVersion.returns({some: 'thing'})

      var out = testCv.getUserContainerMemoryLimit()

      expect(out).to.equal(process.env.CONTAINER_REPO_MEMORY_LIMIT_BYTES)
      sinon.assert.calledOnce(ContextVersion.getMainAppCodeVersion)
      sinon.assert.calledWith(ContextVersion.getMainAppCodeVersion, testCv.appCodeVersions)
      done()
    })

    it('should get non-repo memory limit', function (done) {
      ContextVersion.getMainAppCodeVersion.returns(null)

      var out = testCv.getUserContainerMemoryLimit()

      expect(out).to.equal(process.env.CONTAINER_NON_REPO_MEMORY_LIMIT_BYTES)
      sinon.assert.calledOnce(ContextVersion.getMainAppCodeVersion)
      sinon.assert.calledWith(ContextVersion.getMainAppCodeVersion, testCv.appCodeVersions)
      done()
    })
  }) // end getUserContainerMemoryLimit

  describe('updateBuildErrorByContainer', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'updateBy').yields()
      ctx.mockContextVersions = [
        {
          _id: '098765432109876543214321',
          build: {
            completed: Date.now()
          }
        }
      ]
      ctx.dockerContainer = '123456789012345678901234'
      sinon.stub(ContextVersion, 'findBy').yields(null, ctx.mockContextVersions)
      sinon.stub(messenger, 'emitContextVersionUpdate')
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBy.restore()
      ContextVersion.findBy.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })
    it('should update contextVersions with matching build properties', function (done) {
      var buildErr = Boom.badRequest('message', {
        docker: {
          log: [{some: 'object'}]
        }
      })
      ContextVersion.updateBuildErrorByContainer(ctx.dockerContainer, buildErr, function (err, contextVersions) {
        if (err) {
          return done(err)
        }
        expect(contextVersions).to.equal(ctx.mockContextVersions)
        sinon.assert.calledOnce(ContextVersion.updateBy)
        sinon.assert.calledWith(
          ContextVersion.updateBy,
          'build.dockerContainer',
          ctx.dockerContainer
        )
        var update = ContextVersion.updateBy.firstCall.args[2]
        expect(update).to.exist()
        expect(update.$set).to.deep.contain({
          'build.error.message': buildErr.message,
          'build.error.stack': buildErr.stack,
          'build.log': buildErr.data.docker.log,
          'build.failed': true
        })
        expect(update.$set['build.completed']).to.exist()
        sinon.assert.calledWith(
          ContextVersion.findBy,
          'build.dockerContainer',
          ctx.dockerContainer
        )
        sinon.assert.calledWith(
          messenger.emitContextVersionUpdate,
          ctx.mockContextVersions[0]
        )
        done()
      })
    })
  })

  describe('updateBuildCompletedByContainer', function () {
    beforeEach(function (done) {
      sinon.stub(Context, 'findById').yieldsAsync(null, ctx.mockContext)
      sinon.stub(ContextVersion, 'updateBy').yieldsAsync()
      sinon.stub(ContextVersion, 'findBy').yieldsAsync(null, [ctx.mockContextVersion])
      done()
    })
    afterEach(function (done) {
      Context.findById.restore()
      ContextVersion.updateBy.restore()
      ContextVersion.findBy.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })
    it('should save a successful build', function (done) {
      var opts = {
        dockerImage: 'asdasdfgvaw4fgaw323kjh23kjh4gq3kj',
        log: 'adsfasdfasdfadsfadsf',
        failed: false
      }
      var myCv = {id: 12341}

      sinon.stub(messenger, 'emitContextVersionUpdate', function () {
        done()
      })
      ContextVersion.updateBuildCompletedByContainer(myCv, opts, function () {
        expect(ContextVersion.updateBy.calledOnce).to.be.true()
        expect(ContextVersion.findBy.calledOnce).to.be.true()

        var args = ContextVersion.updateBy.getCall(0).args
        expect(args[0]).to.equal('build.dockerContainer')
        expect(args[1]).to.equal(myCv)
        expect(args[2].$set).to.contains({
          'build.dockerImage': opts.dockerImage,
          'build.log': opts.log,
          'build.failed': opts.failed
        })
        expect(args[2].$set['build.completed']).to.exist()
      })
    })
    it('should save a failed build', function (done) {
      var opts = {
        log: 'adsfasdfasdfadsfadsf',
        failed: true,
        error: {
          message: 'jksdhfalskdjfhadsf'
        },
        'dockerHost': 'http://10.0.0.1:4242'
      }
      var myCv = {id: 12341}
      sinon.stub(messenger, 'emitContextVersionUpdate', function () {
        done()
      })
      ContextVersion.updateBuildCompletedByContainer(myCv, opts, function () {
        sinon.assert.calledOnce(ContextVersion.findBy)
        sinon.assert.calledOnce(ContextVersion.updateBy)
        sinon.assert.calledWith(ContextVersion.updateBy,
          'build.dockerContainer',
          myCv, {
            $set: {
              'build.log': opts.log,
              'build.failed': opts.failed,
              'build.error.message': opts.error.message,
              'build.completed': sinon.match.number,
              'dockerHost': opts.dockerHost
            }
          }, { multi: true })
      })
    })
  })

  describe('save context version validation', function () {
    it('should not possible to save cv without owner', function (done) {
      var c = new Context()
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        context: c._id
      })
      cv.save(function (err) {
        expect(err).to.exist()
        expect(err.message).to.match(/Validation failed/)
        expect(err.errors.owner.message).to.equal('ContextVersions require an Owner')
        done()
      })
    })
  })

  describe('log streams primus', function () {
    it('should be fine if we do not pass it a callback', function (done) {
      var cv = new ContextVersion({
        build: {log: 'hello\nworld\n'}
      })
      var cache = []
      var stream = {
        write: function (data) {
          cache.push(data)
        },
        end: function () {
          done()
        }
      }
      // this will call stream.end for us
      cv.writeLogsToPrimusStream(stream)
    })
    it('should write objects to primus from a string log', function (done) {
      var cv = new ContextVersion({
        build: {log: 'hello\nworld\n'}
      })
      var cache = []
      var stream = {
        write: function (data) {
          cache.push(data)
        },
        end: sinon.spy(function () {
          expect(cache).to.have.length(1)
          expect(cache[0]).to.deep.equal([
            {
              type: 'log',
              content: 'hello\nworld\n'
            }
          ])
          expect(stream.end.callCount).to.equal(1)
          done()
        })
      }
      try {
        cv.writeLogsToPrimusStream(stream)
      } catch (err) {
        return done(err)
      }
    })

    it('should return objects from an array of objects', function (done) {
      var cv = new ContextVersion({
        build: {
          log: [
            {
              type: 'log',
              content: 'hello'
            }, {
              type: 'log',
              content: 'world'
            }
          ]
        }
      })
      var cache = []
      var stream = {
        write: function (data) {
          cache.push(data)
        },
        end: sinon.spy(function () {
          expect(cache).to.have.length(1)
          expect(cache[0]).to.deep.equal([
            {
              type: 'log',
              content: 'hello'
            }, {
              type: 'log',
              content: 'world'
            }
          ])
          done()
        })
      }
      try {
        cv.writeLogsToPrimusStream(stream)
      } catch (err) {
        done(err)
      }
    })
  })

  describe('addGithubRepoToVersion', function () {
    beforeEach(function (done) {
      ctx.c = new Context()
      ctx.cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: ctx.c._id
      })
      ctx.cv.save(done)
    })

    it('should add a repo and save the correct default branch', function (done) {
      var user = {
        accounts: {github: {accessToken: '00'}}
      }
      var repoInfo = {
        repo: 'bkendall/flaming-octo-nemesis',
        branch: 'master',
        commit: '1234abcd'
      }
      sinon.stub(Github.prototype, 'getRepo').yieldsAsync(null, {
        'default_branch': 'not-master' // eslint-disable-line quote-props
      })
      sinon.stub(Github.prototype, 'createRepoHookIfNotAlready', function (repo, cb) {
        cb()
      })
      sinon.stub(Github.prototype, 'addDeployKeyIfNotAlready', function (repo, cb) {
        cb(null, {privateKey: 'private', publicKey: 'public'})
      })
      ContextVersion.addGithubRepoToVersion(user, ctx.cv.id, repoInfo, function (err) {
        if (err) {
          return done(err)
        }
        Github.prototype.getRepo.restore()
        Github.prototype.createRepoHookIfNotAlready.restore()
        Github.prototype.addDeployKeyIfNotAlready.restore()

        ContextVersion.findOne({_id: ctx.cv._id}, function (findErr, doc) {
          if (findErr) {
            return done(findErr)
          }
          expect(doc.appCodeVersions[0].defaultBranch).to.equal('not-master')
          done()
        })
      })
    })
  })

  describe('modifyAppCodeVersion', function () {
    it('should return cv updated with branch', function (done) {
      var c = new Context()
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      }
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.save(function (err) {
        if (err) {
          return done(err)
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}}, {safe: true, upsert: true},
          function (err) {
            if (err) {
              return done(err)
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err)
              }
              newCv.modifyAppCodeVersion(newCv.appCodeVersions[0]._id,
                {branch: 'Some-branch'},
                function (err, updatedCv) {
                  expect(err).to.be.null()
                  expect(updatedCv.appCodeVersions[0].branch).to.equal('Some-branch')
                  expect(updatedCv.appCodeVersions[0].lowerBranch).to.equal('some-branch')
                  done()
                })
            })
          })
      })
    })
    it('should return cv updated with commit', function (done) {
      var c = new Context()
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      }
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.save(function (err) {
        if (err) {
          return done(err)
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}}, {safe: true, upsert: true},
          function (err) {
            if (err) {
              return done(err)
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err)
              }
              newCv.modifyAppCodeVersion(
                newCv.appCodeVersions[0]._id,
                {commit: 'd5a527f959342c2e00151612be973c89b9fa7078'},
                function (err, updatedCv) {
                  expect(err).to.be.null()
                  expect(updatedCv.appCodeVersions[0].commit).to.equal('d5a527f959342c2e00151612be973c89b9fa7078')
                  done()
                })
            })
          })
      })
    })
    it('should return cv updated with useLatest flag', function (done) {
      var c = new Context()
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      }
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.save(function (err) {
        if (err) {
          return done(err)
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}}, {safe: true, upsert: true},
          function (err) {
            if (err) {
              return done(err)
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err)
              }
              newCv.modifyAppCodeVersion(newCv.appCodeVersions[0]._id, {useLatest: true}, function (err, updatedCv) {
                expect(err).to.be.null()
                expect(updatedCv.appCodeVersions[0].useLatest).to.be.true()
                done()
              })
            })
          })
      })
    })
    it('should return cv updated with transformRules', function (done) {
      var c = new Context()
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      }
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.save(function (err) {
        if (err) {
          return done(err)
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}}, {safe: true, upsert: true},
          function (err) {
            if (err) {
              return done(err)
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err)
              }
              var transformRules = {
                exclude: ['a.txt']
              }
              newCv.modifyAppCodeVersion(
                newCv.appCodeVersions[0]._id,
                {transformRules: transformRules},
                function (err, updatedCv) {
                  expect(err).to.be.null()
                  expect(updatedCv.appCodeVersions[0].transformRules.exclude).to.deep.equal(transformRules.exclude)
                  done()
                })
            })
          })
      })
    })
  })

  describe('modifyAppCodeVersionWithLatestCommit', function () {
    it('should return current same cv if no acs were found', function (done) {
      var c = new Context()
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.modifyAppCodeVersionWithLatestCommit({id: 'some-id'}, function (err, updatedCv) {
        expect(err).to.be.null()
        expect(updatedCv).to.deep.equal(cv)
        done()
      })
    })

    it('should return same cv if all acvs have userLatest=false', function (done) {
      var c = new Context()
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      }
      var acv2 = {
        repo: 'codenow/api',
        branch: 'master',
        additionalRepo: true
      }
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.save(function (err) {
        if (err) {
          return done(err)
        }
        cv.update({$pushAll: {appCodeVersions: [acv1, acv2]}}, {safe: true, upsert: true},
          function (err) {
            if (err) {
              return done(err)
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err)
              }
              newCv.modifyAppCodeVersionWithLatestCommit({id: 'some-id'}, function (err, updatedCv) {
                expect(err).to.be.null()
                expect(updatedCv).to.deep.equal(newCv)
                done()
              })
            })
          })
      })
    })

    it('should update acv with latest commit if userLatest=true', function (done) {
      var c = new Context()
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      }
      var acv2 = {
        repo: 'codenow/api',
        branch: 'master',
        additionalRepo: true
      }
      var acv3 = {
        repo: 'codenow/web',
        branch: 'master',
        additionalRepo: true,
        useLatest: true
      }
      var acv4 = {
        repo: 'codenow/docker-listener',
        branch: 'master',
        additionalRepo: true,
        useLatest: true
      }
      var cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: c._id
      })
      cv.save(function (err) {
        if (err) {
          return done(err)
        }
        cv.update({$pushAll: {appCodeVersions: [acv1, acv2, acv3, acv4]}},
          {safe: true, upsert: true},
          function (err) {
            if (err) {
              return done(err)
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err)
              }
              require('../../../test/functional/fixtures/mocks/github/repos-username-repo-branches-branch')(newCv)
              newCv.modifyAppCodeVersionWithLatestCommit({id: 'some-id'}, function (err, updatedCv) {
                expect(err).to.be.null()
                expect(updatedCv.appCodeVersions[0].commit).to.be.undefined()
                expect(updatedCv.appCodeVersions[1].commit).to.be.undefined()
                expect(updatedCv.appCodeVersions[2].commit).to.have.length(40)
                expect(updatedCv.appCodeVersions[3].commit).to.have.length(40)
                done()
              })
            })
          })
      })
    })
  }) // end 'modifyAppCodeVersionWithLatestCommit'

  describe('#modifyAppCodeVersionByRepo', function () {
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findOneAndUpdate').yieldsAsync()
      done()
    })
    afterEach(function (done) {
      ContextVersion.findOneAndUpdate.restore()
      done()
    })

    it('updates a context version with repo information and return it', function (done) {
      var repo = 'CodeNow'
      var branch = 'SAN-master'
      var commit = 'deadbeef'
      ContextVersion.findOneAndUpdate.yieldsAsync(null, ctx.mockContextVersion)
      ContextVersion.modifyAppCodeVersionByRepo(
        ctx.mockContextVersion._id,
        repo,
        branch,
        commit,
        function (err, doc) {
          if (err) {
            return done(err)
          }
          expect(doc).to.deep.equal(ctx.mockContextVersion)
          sinon.assert.calledWith(
            ContextVersion.findOneAndUpdate,
            {
              _id: ctx.mockContextVersion._id,
              'appCodeVersions.lowerRepo': repo.toLowerCase()
            },
            {
              $set: {
                'appCodeVersions.$.branch': branch,
                'appCodeVersions.$.lowerBranch': branch.toLowerCase(),
                'appCodeVersions.$.commit': commit
              }
            },
            sinon.match.func
          )
          done()
        }
      )
    })

    it('should bubble update errors', function (done) {
      var error = new Error('KAAAHHHNNN')
      ContextVersion.findOneAndUpdate.yieldsAsync(error)
      ContextVersion.modifyAppCodeVersionByRepo('hi', 'hi', 'hi', 'hi', function (err) {
        expect(err).to.equal(error)
        done()
      })
    })
  })

  describe('addAppCodeVersionQuery', function () {
    var cv
    var cvNoAppCodeVersions
    var query
    var infraCodeVersion = 'HASH'
    var appCodeVersions = [
      {lowerRepo: 'some-repo-name', commit: 'c0ffee'},
      {lowerRepo: 'some-other-name', commit: 'deadbeef'}
    ]

    beforeEach(function (done) {
      query = {infraCodeVersion: infraCodeVersion}
      cv = new ContextVersion({appCodeVersions: appCodeVersions})
      cvNoAppCodeVersions = new ContextVersion({appCodeVersions: []})
      done()
    })

    it('should preserve original query conditions', function (done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query)
      expect(result.infraCodeVersion).to.equal(infraCodeVersion)
      done()
    })

    it('should add app code versions conditions when present', function (done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query)
      expect(result.$and).to.be.an.array()
      expect(result.$and.every(isObject)).to.be.true()
      expect(result.$and.length).to.equal(appCodeVersions.length + 1)
      done()
    })

    it('should add the correct clause for each app code version', function (done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query)
      for (var i = 0; i < 2; i++) {
        expect(result.$and[i].appCodeVersions).to.be.an.object()
        expect(result.$and[i].appCodeVersions.$elemMatch).to.be.an.object()
        var $elemMatch = result.$and[i].appCodeVersions.$elemMatch
        expect($elemMatch).to.deep.equal(appCodeVersions[i])
      }
      done()
    })

    it('should add the correct size clause', function (done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query)
      var clause = result.$and[result.$and.length - 1]
      expect(clause.appCodeVersions).to.be.an.object()
      expect(clause.appCodeVersions.$size).to.equal(appCodeVersions.length)
      done()
    })

    it('should only add the size clause without appCodeVersions', function (done) {
      var result = ContextVersion.addAppCodeVersionQuery(
        cvNoAppCodeVersions,
        query
      )
      expect(result.appCodeVersions).to.be.an.object()
      expect(result.appCodeVersions.$size).to.equal(0)
      done()
    })
  }) // end 'addAppCodeVersionQuery'

  describe('updateBuildHash', function () {
    var cv

    beforeEach(function (done) {
      cv = new ContextVersion({
        build: {hash: 'old-hash'}
      })
      sinon.stub(cv, 'update').yieldsAsync(null)
      done()
    })

    afterEach(function (done) {
      cv.update.restore()
      done()
    })

    it('should use the correct query', function (done) {
      var hash = 'random-hash'
      var expectedQuery = {
        $set: {
          'build.hash': hash
        }
      }
      cv.updateBuildHash(hash, function (err) {
        if (err) {
          return done(err)
        }
        expect(cv.update.calledOnce).to.be.true()
        expect(cv.update.calledWith(expectedQuery)).to.be.true()
        done()
      })
    })

    it('should set the hash on the context version', function (done) {
      var hash = 'brand-new-hash'
      cv.updateBuildHash(hash, function (err) {
        if (err) {
          return done(err)
        }
        expect(cv.build.hash).to.equal(hash)
        done()
      })
    })

    it('should correctly handle update errors', function (done) {
      var updateError = new Error('Update is too cool to work right now.')
      cv.update.yieldsAsync(updateError)
      cv.updateBuildHash('rando', function (err) {
        expect(err).to.exist()
        expect(err).to.equal(updateError)
        done()
      })
    })
  }) // end 'updateBuildHash'

  describe('findPendingDupe', function () {
    var cv
    var dupe
    var cvTimestamp = 20

    beforeEach(function (done) {
      cv = new ContextVersion({
        build: {
          _id: 'id-a',
          hash: 'hash-a',
          started: new Date(cvTimestamp)
        }
      })
      dupe = new ContextVersion({
        build: {
          _id: 'id-b',
          hash: 'hash-b',
          started: new Date(cvTimestamp - 10)
        }
      })
      sinon.stub(ContextVersion, 'find').yieldsAsync(null, [dupe])
      done()
    })

    afterEach(function (done) {
      ContextVersion.find.restore()
      done()
    })

    it('uses the correct ContextVersion.find query', function (done) {
      var expectedQuery = ContextVersion.addAppCodeVersionQuery(cv, {
        'build.completed': {$exists: false},
        'build.hash': cv.build.hash,
        'build._id': {$ne: cv.build._id},
        advanced: false
      })

      cv.findPendingDupe(function (err) {
        if (err) {
          return done(err)
        }
        expect(ContextVersion.find.calledOnce).to.be.true()
        expect(ContextVersion.find.firstCall.args[0])
          .to.deep.equal(expectedQuery)
        done()
      })
    })

    it('uses the correct ContextVersion.find options', function (done) {
      var expectedOptions = {
        sort: 'build.started',
        limit: 1
      }

      cv.findPendingDupe(function (err) {
        if (err) {
          return done(err)
        }
        expect(ContextVersion.find.calledOnce).to.be.true()
        expect(ContextVersion.find.firstCall.args[2])
          .to.deep.equal(expectedOptions)
        done()
      })
    })

    it('handles ContextVersion.find errors', function (done) {
      var findError = new Error('API is upset, and does not want to work.')
      ContextVersion.find.yieldsAsync(findError)

      cv.findPendingDupe(function (err) {
        expect(err).to.equal(findError)
        done()
      })
    })

    it('yields null if oldest pending is younger than itself', function (done) {
      ContextVersion.find.yieldsAsync(null, [
        new ContextVersion({
          build: {
            _id: 'id-b',
            hash: 'hash-b',
            started: new Date(cvTimestamp + 10)
          }
        })
      ])

      cv.findPendingDupe(function (err, pendingDuplicate) {
        if (err) {
          return done(err)
        }
        expect(pendingDuplicate).to.be.null()
        done()
      })
    })

    it('yields nothing if the oldest pending is null', function (done) {
      ContextVersion.find.yieldsAsync(null, [])

      cv.findPendingDupe(function (err, pendingDuplicate) {
        if (err) {
          return done(err)
        }
        expect(pendingDuplicate).to.not.exist()
        done()
      })
    })

    it('yields the oldest pending duplicate when applicable', function (done) {
      cv.findPendingDupe(function (err, pendingDuplicate) {
        if (err) {
          return done(err)
        }
        expect(pendingDuplicate).to.equal(dupe)
        done()
      })
    })
  }) // end 'findPendingDupe'

  describe('findCompletedDupe', function () {
    var cv
    var dupe

    beforeEach(function (done) {
      cv = new ContextVersion({
        build: {
          _id: 'id-a',
          hash: 'hash-a'
        }
      })
      dupe = new ContextVersion({
        build: {
          _id: 'id-b',
          hash: 'hash-b'
        }
      })
      sinon.stub(ContextVersion, 'find').yieldsAsync(null, [dupe])
      done()
    })

    afterEach(function (done) {
      ContextVersion.find.restore()
      done()
    })

    it('uses the correct ContextVersion.find query', function (done) {
      var expectedQuery = ContextVersion.addAppCodeVersionQuery(cv, {
        'build.completed': {$exists: true},
        'build.hash': cv.build.hash,
        'build._id': {$ne: cv.build._id},
        advanced: false
      })

      cv.findCompletedDupe(function (err) {
        if (err) {
          return done(err)
        }
        expect(ContextVersion.find.calledOnce).to.be.true()
        expect(ContextVersion.find.firstCall.args[0])
          .to.deep.equal(expectedQuery)
        done()
      })
    })

    it('uses the correct ContextVersion.find options', function (done) {
      var expectedOptions = {
        sort: '-build.started',
        limit: 1
      }

      cv.findCompletedDupe(function (err) {
        if (err) {
          return done(err)
        }
        expect(ContextVersion.find.calledOnce).to.be.true()
        expect(ContextVersion.find.firstCall.args[2])
          .to.deep.equal(expectedOptions)
        done()
      })
    })

    it('yields the correct duplicate', function (done) {
      cv.findCompletedDupe(function (err, completedDupe) {
        if (err) {
          return done(err)
        }
        expect(completedDupe).to.equal(dupe)
        done()
      })
    })
  }) // end 'findCompletedDupe'

  describe('dedupeBuild', function () {
    var cv
    var dupe
    var hash = 'icv-hash'

    beforeEach(function (done) {
      cv = new ContextVersion({
        infraCodeVersion: 'infra-code-version-id',
        owner: {github: 1}
      })
      dupe = new ContextVersion({
        infraCodeVersion: 'infra-code-version-id',
        owner: {github: 1}
      })
      sinon.stub(InfraCodeVersion, 'findByIdAndGetHash')
        .yieldsAsync(null, hash)
      sinon.stub(cv, 'updateBuildHash').yieldsAsync()
      sinon.stub(cv, 'findPendingDupe').yieldsAsync(null, dupe)
      sinon.stub(cv, 'findCompletedDupe').yieldsAsync(null, dupe)
      sinon.stub(cv, 'copyBuildFromContextVersion')
        .yieldsAsync(null, dupe)
      done()
    })

    afterEach(function (done) {
      InfraCodeVersion.findByIdAndGetHash.restore()
      cv.updateBuildHash.restore()
      cv.findPendingDupe.restore()
      cv.findCompletedDupe.restore()
      cv.copyBuildFromContextVersion.restore()
      done()
    })

    it('should find the hash via InfraCodeVersion', function (done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(InfraCodeVersion.findByIdAndGetHash.calledOnce).to.be.true()
        expect(InfraCodeVersion.findByIdAndGetHash.calledWith(
          cv.infraCodeVersion
        )).to.be.true()
        done()
      })
    })

    it('should set the hash returned by InfraCodeVersion', function (done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(cv.updateBuildHash.calledOnce).to.be.true()
        expect(cv.updateBuildHash.calledWith(hash)).to.be.true()
        done()
      })
    })

    it('should find pending duplicates', function (done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(cv.findPendingDupe.calledOnce).to.be.true()
        done()
      })
    })

    it('should not find completed duplicates with one pending', function (done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(cv.findCompletedDupe.callCount).to.equal(0)
        done()
      })
    })

    it('should find completed duplicates without one pending', function (done) {
      cv.findPendingDupe.yieldsAsync(null, null)

      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(cv.findCompletedDupe.calledOnce).to.be.true()
        done()
      })
    })

    it('should handle completed duplicate lookup errors', function (done) {
      var completedErr = new Error('API is not feeling well, try later.')
      cv.findPendingDupe.yieldsAsync(null, null)
      cv.findCompletedDupe.yieldsAsync(completedErr, null)

      cv.dedupeBuild(function (err) {
        expect(err).to.equal(completedErr)
        done()
      })
    })

    it('should dedupe cvs with the same owner', function (done) {
      cv.dedupeBuild(function (err, result) {
        if (err) { return done(err) }
        expect(result).to.equal(dupe)
        done()
      })
    })

    it('should not dedupe a cv with a different owner', function (done) {
      dupe.owner.github = 2
      cv.dedupeBuild(function (err, result) {
        if (err) { return done(err) }
        expect(result).to.equal(cv)
        done()
      })
    })

    it('should replace itself if a duplicate was found', function (done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(cv.copyBuildFromContextVersion.calledOnce).to.be.true()
        expect(cv.copyBuildFromContextVersion.calledWith(dupe))
          .to.be.true()
        done()
      })
    })

    it('should not replace itself without a duplicate', function (done) {
      cv.findPendingDupe.yieldsAsync(null, null)
      cv.findCompletedDupe.yieldsAsync(null, null)

      cv.dedupeBuild(function (err) {
        if (err) { return done(err) }
        expect(cv.copyBuildFromContextVersion.callCount).to.equal(0)
        expect(cv.copyBuildFromContextVersion.calledWith(dupe))
          .to.be.false()
        done()
      })
    })
  }) // end 'dedupeBuild'

  describe('populateOwner', function () {
    beforeEach(function (done) {
      ctx.c = new Context()
      ctx.cv = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: ctx.c._id
      })
      done()
    })
    it('should return an error if user was not found', function (done) {
      var sessionUser = new User()
      sinon.stub(sessionUser, 'findGithubUserByGithubId').yieldsAsync(new Error('No user'))
      ctx.cv.populateOwner(sessionUser, function (err) {
        expect(err).to.exist()
        expect(err.message).to.equal('No user')
        done()
      })
    })
    it('should return an error if session user was not provided', function (done) {
      ctx.cv.populateOwner(null, function (err) {
        expect(err).to.exist()
        expect(err.output.statusCode).to.equal(500)
        expect(err.message).to.equal('SessionUser is required')
        done()
      })
    })
    it('should populate owner userane and gravatar', function (done) {
      var sessionUser = new User()
      var userData = {
        login: 'anton',
        avatar_url: 'https://avatars.githubusercontent.com/u/429706?v=3'
      }
      sinon.stub(sessionUser, 'findGithubUserByGithubId').yieldsAsync(null, userData)
      ctx.cv.populateOwner(sessionUser, function (err, updatedCv) {
        expect(err).to.not.exist()
        expect(updatedCv.owner.username).to.equal(userData.login)
        expect(updatedCv.owner.gravatar).to.equal(userData.avatar_url)
        expect(ctx.cv.owner.username).to.equal(userData.login)
        expect(ctx.cv.owner.gravatar).to.equal(userData.avatar_url)
        done()
      })
    })
  }) // end 'populateOwner'

  describe('#markDockRemovedByDockerHost', function () {
    var dockerHost = '1234'
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'update').yieldsAsync()
      done()
    })
    afterEach(function (done) {
      ContextVersion.update.restore()
      done()
    })

    it('should call update with the right parameters', function (done) {
      ContextVersion.markDockRemovedByDockerHost(dockerHost, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersion.update)
        sinon.assert.calledWith(ContextVersion.update,
          {dockerHost: dockerHost},
          {$set: {dockRemoved: true}},
          {multi: true},
          sinon.match.func
        )
        done()
      })
    })

    it('should pass the database error through to the callback', function (done) {
      var error = 'Mongo Error'
      ContextVersion.update.yieldsAsync(error)
      ContextVersion.markDockRemovedByDockerHost(dockerHost, function (err) {
        expect(err).to.equal(error)
        sinon.assert.calledOnce(ContextVersion.update)
        done()
      })
    })

    it('should be asyncified properly!', function (done) {
      ContextVersion.markDockRemovedByDockerHostAsync.bind(ContextVersion, dockerHost)()
        .asCallback(function (err) {
          expect(err).to.not.exist()
          done()
        })
    })
  })

  describe('recover', function () {
    var updatedCv
    var contextVersion
    beforeEach(function (done) {
      updatedCv = {
        dockRemoved: false
      }
      contextVersion = new ContextVersion({
        createdBy: {github: 1000},
        owner: {github: 2874589},
        context: ctx.c._id
      })
      sinon.stub(ContextVersion, 'findOneAndUpdate').yieldsAsync(null, updatedCv)
      done()
    })
    afterEach(function (done) {
      ContextVersion.findOneAndUpdate.restore()
      done()
    })
    it('should return success', function (done) {
      ContextVersion.recover(contextVersion._id, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
        sinon.assert.calledWith(ContextVersion.findOneAndUpdate,
          {'_id': contextVersion._id, 'dockRemoved': true},
          {$set: {'dockRemoved': false}},
          sinon.match.func)
        done()
      })
    })
    it('should cb error', function (done) {
      var error = new Error('DB Error!')
      ContextVersion.findOneAndUpdate.yieldsAsync(error)
      ContextVersion.recover(contextVersion._id, function (err) {
        expect(err).to.equal(error)
        sinon.assert.calledOnce(ContextVersion.findOneAndUpdate)
        sinon.assert.calledWith(ContextVersion.findOneAndUpdate,
          {'_id': contextVersion._id, 'dockRemoved': true},
          {$set: {'dockRemoved': false}},
          sinon.match.func)
        done()
      })
    })
  })

  describe('buildSelf', function () {
    var contextVersion
    var opts
    var sessionUser
    var domain
    beforeEach(function (done) {
      ctx.c = new Context()
      contextVersion = new ContextVersion({
        createdBy: {github: 1000},
        owner: {
          github: 2874589,
          username: 'hello'
        },
        context: ctx.c._id
      })
      domain = {
        runnableData: {
          tid: uuid()
        }
      }
      sessionUser = {}
      keypather.set(sessionUser, 'accounts.github.id', 1234)
      sinon.stub(contextVersion, 'modifyAppCodeVersionWithLatestCommitAsync').resolves(contextVersion)
      sinon.stub(contextVersion, 'dedupeAsync').resolves(contextVersion)
      sinon.stub(ContextVersion, 'removeByIdAsync').resolves()
      sinon.stub(ContextVersion, '_startBuild').resolves(contextVersion)
      done()
    })
    afterEach(function (done) {
      contextVersion.modifyAppCodeVersionWithLatestCommitAsync.restore()
      contextVersion.dedupeAsync.restore()
      ContextVersion.removeByIdAsync.restore()
      ContextVersion._startBuild.restore()
      done()
    })
    it('should reject when a contextVersion is already building, and not even call the first function', function (done) {
      opts = {
        triggeredAction: {
          manual: true
        }
      }
      contextVersion._doc.build.started = new Date()
      ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
        .catch(function (err) {
          expect(err.message).to.contain('cannot build a context version that is already building or built')
          sinon.assert.notCalled(contextVersion.modifyAppCodeVersionWithLatestCommitAsync)
        })
        .asCallback(done)
    })
    describe('normal build flow', function () {
      beforeEach(function (done) {
        opts = {
          triggeredAction: {
            manual: true
          }
        }
        done()
      })
      it('should attempt to call dedupeAsync, but not remove, before starting the build', function (done) {
        ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledOnce(contextVersion.dedupeAsync)
            sinon.assert.notCalled(ContextVersion.removeByIdAsync)
            sinon.assert.calledWith(ContextVersion._startBuild, contextVersion, sessionUser, opts, domain)
          })
          .asCallback(done)
      })
      it('should try to start the build of a normal build', function (done) {
        ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledWith(ContextVersion._startBuild, contextVersion, sessionUser, opts, domain)
          })
          .asCallback(done)
      })
    })
    describe('noCache build flow', function () {
      beforeEach(function (done) {
        opts = {
          noCache: true
        }
        done()
      })
      it('should skip calling dedupAsync', function (done) {
        opts = {
          noCache: true
        }
        ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.notCalled(contextVersion.dedupeAsync)
          })
          .asCallback(done)
      })
      it('should attempt to start a no-cached build', function (done) {
        opts = {
          noCache: true
        }
        ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledWith(ContextVersion._startBuild, contextVersion, sessionUser, opts, domain)
          })
          .asCallback(done)
      })
    })
    describe('dedup build flow', function () {
      var newCv
      beforeEach(function (done) {
        newCv = new ContextVersion({
          createdBy: {github: 1000},
          owner: {
            github: 2874589,
            username: 'hello'
          },
          build: {
            started: new Date()
          },
          context: ctx.c._id
        })
        opts = {
          triggeredAction: {
            manual: true
          }
        }
        contextVersion.dedupeAsync.restore()
        sinon.stub(contextVersion, 'dedupeAsync').resolves(newCv)
        done()
      })
      it('should not call _startBuild when a dedupe happens', function (done) {
        ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
          .then(function () {
            sinon.assert.notCalled(ContextVersion._startBuild)
          })
          .asCallback(done)
      })
      it('should remove itself, and return the dupe cv', function (done) {
        ContextVersion.buildSelf(contextVersion, sessionUser, opts, domain)
          .then(function (shouldBeNewCv) {
            expect(shouldBeNewCv).to.equal(newCv)
            sinon.assert.calledOnce(contextVersion.dedupeAsync)
            sinon.assert.calledOnce(ContextVersion.removeByIdAsync)
          })
          .asCallback(done)
      })
    })
  })

  describe('_startBuild', function () {
    var context
    var contextVersion
    var opts
    var sessionUser
    var domain
    beforeEach(function (done) {
      context = new Context()
      contextVersion = new ContextVersion({
        createdBy: {github: 1000},
        owner: {
          github: 2874589,
          username: 'hello'
        },
        context: context._id
      })
      domain = {
        runnableData: {
          tid: uuid()
        }
      }
      sessionUser = {}
      keypather.set(sessionUser, 'accounts.github.id', 1234)
      sinon.stub(contextVersion, 'setBuildStartedAsync').resolves(contextVersion)
      sinon.stub(contextVersion, 'populateOwnerAsync').resolves(contextVersion)
      sinon.stub(contextVersion, 'dedupeBuildAsync').resolves(contextVersion)
      sinon.stub(contextVersion, 'getAndUpdateHashAsync').resolves()
      sinon.stub(rabbitMQ, 'createImageBuilderContainer').resolves()
      done()
    })
    afterEach(function (done) {
      contextVersion.setBuildStartedAsync.restore()
      contextVersion.populateOwnerAsync.restore()
      contextVersion.dedupeBuildAsync.restore()
      contextVersion.getAndUpdateHashAsync.restore()
      rabbitMQ.createImageBuilderContainer.restore()
      done()
    })
    describe('normal build flow', function () {
      beforeEach(function (done) {
        opts = {
          triggeredAction: {
            manual: true
          }
        }
        done()
      })
      it('should call setBuildStartedAsync, dedupeBuildAsync, and populateOwnerAsync before rabbit', function (done) {
        ContextVersion._startBuild(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledWith(contextVersion.setBuildStartedAsync, sessionUser, opts)
            sinon.assert.calledOnce(contextVersion.dedupeBuildAsync)
            sinon.assert.notCalled(contextVersion.getAndUpdateHashAsync)
            sinon.assert.calledWith(contextVersion.populateOwnerAsync, sessionUser)
          })
          .asCallback(done)
      })
      it('should create a build job for a normal build', function (done) {
        ContextVersion._startBuild(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledOnce(rabbitMQ.createImageBuilderContainer)
            sinon.assert.calledWith(rabbitMQ.createImageBuilderContainer, sinon.match({
              manualBuild: true,
              sessionUserGithubId: 1234,
              ownerUsername: 'hello',
              contextId: contextVersion.context.toString(),
              contextVersionId: contextVersion._id.toString(),
              noCache: false,
              tid: domain.runnableData.tid
            }))
          })
          .asCallback(done)
      })
    })
    describe('noCache build flow', function () {
      beforeEach(function (done) {
        opts = {
          noCache: true
        }
        done()
      })
      it('should call setBuildStartedAsync, populateOwnerAsync, and getAndUpdateHashAsync', function (done) {
        ContextVersion._startBuild(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledWith(contextVersion.setBuildStartedAsync, sessionUser, opts)
            sinon.assert.calledWith(contextVersion.populateOwnerAsync, sessionUser)
            sinon.assert.calledOnce(contextVersion.getAndUpdateHashAsync)
            sinon.assert.notCalled(contextVersion.dedupeBuildAsync)
          })
          .asCallback(done)
      })
      it('should create a build job for a no-cached build', function (done) {
        ContextVersion._startBuild(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledOnce(rabbitMQ.createImageBuilderContainer)
            sinon.assert.calledWith(rabbitMQ.createImageBuilderContainer, sinon.match({
              manualBuild: false,
              sessionUserGithubId: 1234,
              ownerUsername: 'hello',
              contextId: context._id.toString(),
              contextVersionId: contextVersion._id.toString(),
              noCache: true,
              tid: domain.runnableData.tid
            }))
          })
          .asCallback(done)
      })
    })
    describe('dedup build flow', function () {
      beforeEach(function (done) {
        opts = {
          triggeredAction: {
            manual: true
          }
        }
        contextVersion.dedupeBuildAsync.restore()
        sinon.stub(contextVersion, 'dedupeBuildAsync', function () {
          contextVersion._doc.build._id = '13245dsf'
          // Can't use .resolves() because I need this function to wait until this is called to
          // modify the original cv
          return Promise.resolve(contextVersion)
        })
        done()
      })
      it('should flow through the normal build flow up until actually making the job', function (done) {
        ContextVersion._startBuild(contextVersion, sessionUser, opts, domain)
          .then(function (contextVersion) {
            sinon.assert.calledWith(contextVersion.setBuildStartedAsync, sessionUser, opts)
            sinon.assert.calledOnce(contextVersion.dedupeBuildAsync)
            sinon.assert.notCalled(contextVersion.populateOwnerAsync)
            sinon.assert.notCalled(rabbitMQ.createImageBuilderContainer)
          })
          .asCallback(done)
      })
      it('should not attempt to create an image-builder job', function (done) {
        ContextVersion._startBuild(contextVersion, sessionUser, opts, domain)
          .then(function () {
            sinon.assert.notCalled(rabbitMQ.createImageBuilderContainer)
          })
          .asCallback(done)
      })
    })
  })

  describe('generateQueryForAppCodeVersions', function () {
    describe('Validations', function () {
      it('should tell us an arrya is required', function (done) {
        var query = {}
        expect(ContextVersion.generateQueryForAppCodeVersions.bind(ContextVersion, query)).to.throw(Error, /array/)
        done()
      })
      it('should tell us repo is required', function (done) {
        var query = [{
          commit: 'ecf59dadf7296405101e284a1bb9251b178f48f9',
          branch: 'super-branch'
        }]
        expect(ContextVersion.generateQueryForAppCodeVersions.bind(ContextVersion, query)).to.throw(Error, /repo.*branch.*commit.*string/)
        done()
      })
      it('should tell us branch is required', function (done) {
        var query = [{
          commit: 'ecf59dadf7296405101e284a1bb9251b178f48f9',
          repo: 'wow/hello-world'
        }, {
          commit: 'ecf59dadf7296405101e284a1bb9251b178f48f9',
          branch: 'hello',
          repo: 'wow/hello-world'
        }]
        expect(ContextVersion.generateQueryForAppCodeVersions.bind(ContextVersion, query)).to.throw(Error, /repo.*branch.*commit.*string/)
        done()
      })
      it('should tell us commit is required', function (done) {
        var query = [{
          commit: 'ecf59dadf7296405101e284a1bb9251b178f48f9',
          branch: 'super-branch',
          repo: 'wow/hello-world'
        }, {
          branch: 'hello',
          repo: 'wow/hello-world'
        }]
        expect(ContextVersion.generateQueryForAppCodeVersions.bind(ContextVersion, query)).to.throw(Error, /repo.*branch.*commit.*string/)
        done()
      })
    })
    describe('Queries', function () {
      it('should return an empty array if one is passed', function (done) {
        var query = ContextVersion.generateQueryForAppCodeVersions([])
        expect(query).to.be.an.object()
        expect(query.$size).to.be.a.number()
        expect(query.$size).to.equal(0)
        expect(query.$all).to.be.an.array()
        expect(query.$all).to.be.empty(0)
        done()
      })
      it('should map the properties accordingly', function (done) {
        var repoName = 'wow/Hello-World'
        var appCodeVersionQuery = [{
          commit: 'ecf59dadf7296405101e284a1bb9251b178f48f9',
          branch: 'super-branch',
          repo: repoName
        }, {
          commit: 'ecf59dadf7296405101e284a1bb9251b178f48f9',
          branch: 'hello',
          repo: repoName
        }]
        var query = ContextVersion.generateQueryForAppCodeVersions(appCodeVersionQuery)
        expect(query).to.be.an.object()
        expect(query.$size).to.be.a.number()
        expect(query.$size).to.equal(2)
        expect(query.$all).to.be.an.array()
        expect(query.$all.length).to.be.equal(2)
        expect(query.$all[0]).to.be.an.object()
        expect(query.$all[0].$elemMatch).to.be.an.object()
        expect(query.$all[0].$elemMatch).to.include(['lowerRepo', 'lowerBranch', 'commit'])
        expect(query.$all[0].$elemMatch.lowerRepo).to.equal(repoName.toLowerCase())
        done()
      })
    })
  })

  describe('generateQueryForBranchAndRepo', function () {
    describe('Validations', function () {
      it('should throw an error if the is no branch passed', function (done) {
        expect(ContextVersion.generateQueryForBranchAndRepo.bind(ContextVersion, 'repo')).to.throw(Error, /branch.*string/)
        done()
      })
      it('should throw an error if the branch is not a string', function (done) {
        expect(ContextVersion.generateQueryForBranchAndRepo.bind(ContextVersion, 'repo', 123)).to.throw(Error, /branch.*string/)
        done()
      })
      it('should throw an error if the is no repo passed', function (done) {
        expect(ContextVersion.generateQueryForBranchAndRepo.bind(ContextVersion, undefined, 123)).to.throw(Error, /repo.*string/)
        done()
      })
      it('should throw an error if the repo is not a string', function (done) {
        expect(ContextVersion.generateQueryForBranchAndRepo.bind(ContextVersion, {}, 123)).to.throw(Error, /repo.*string/)
        done()
      })
    })
    describe('Queries', function () {
      it('should generate the appropriate query', function (done) {
        var branchName = 'helloWorld'
        var repoName = 'CodeNow/wow'
        var query = ContextVersion.generateQueryForBranchAndRepo(repoName, branchName)
        expect(query).to.be.an.object()
        expect(query.appCodeVersions).to.be.an.object()
        expect(query.appCodeVersions.$elemMatch).to.be.an.object()
        expect(query.appCodeVersions.$elemMatch).to.be.an.object()
        expect(query.appCodeVersions.$elemMatch.lowerBranch).to.be.a.string()
        expect(query.appCodeVersions.$elemMatch.lowerBranch).to.equal(branchName.toLowerCase())
        expect(query.appCodeVersions.$elemMatch.lowerRepo).to.be.a.string()
        expect(query.appCodeVersions.$elemMatch.lowerRepo).to.equal(repoName.toLowerCase())
        expect(query.appCodeVersions.$elemMatch.additionalRepo).to.be.an.object()
        done()
      })
    })
  })
})
