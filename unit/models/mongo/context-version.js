'use strict'
var Code = require('code')
var Lab = require('lab')
var Promise = require('bluebird')
var sinon = require('sinon')

var ContextVersion = require('models/mongo/context-version')
var messenger = require('socket/messenger')

require('sinon-as-promised')(Promise)
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Context Version Unit Test', function () {
  describe('updateBuildCompletedByBuildId', function () {
    var mockContextVersion
    beforeEach(function (done) {
      mockContextVersion = {
        _id: '55d3ef733e1b620e00eb6292',
        state: 'starting',
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
      sinon.stub(ContextVersion, 'updateBy').yieldsAsync()
      sinon.stub(ContextVersion, 'findBy').yieldsAsync(null, [mockContextVersion])
      sinon.stub(messenger, 'emitContextVersionUpdate').returns()
      done()
    })

    afterEach(function (done) {
      ContextVersion.updateBy.restore()
      ContextVersion.findBy.restore()
      messenger.emitContextVersionUpdate.restore()
      done()
    })

    it('should save a successful build', function (done) {
      var opts = {
        dockerImage: 'asdasdfgvaw4fgaw323kjh23kjh4gq3kj',
        failed: false
      }
      var buildId = 12341

      ContextVersion.updateBuildCompletedByBuildId(buildId, opts, function () {
        sinon.assert.calledOnce(ContextVersion.updateBy)
        sinon.assert.calledWith(ContextVersion.updateBy,
          'build._id',
          buildId, {
            $set: {
              'build.dockerImage': opts.dockerImage,
              'build.failed': opts.failed,
              'build.completed': sinon.match.number,
              'state': ContextVersion.states.buildSucceeded
            }
          })

        sinon.assert.calledOnce(ContextVersion.findBy)
        sinon.assert.calledWith(ContextVersion.findBy,
          'build._id',
          buildId, {
            'build.log': false
          })
        done()
      })
    })

    it('should save a failed build', function (done) {
      var opts = {
        failed: true,
        error: {
          message: 'jksdhfalskdjfhadsf'
        },
        'dockerHost': 'http://10.0.0.1:4242'
      }
      var buildId = 12341

      ContextVersion.updateBuildCompletedByBuildId(buildId, opts, function () {
        sinon.assert.calledOnce(ContextVersion.findBy)
        sinon.assert.calledOnce(ContextVersion.updateBy)
        sinon.assert.calledWith(ContextVersion.updateBy,
          'build._id',
          buildId, {
            $set: {
              'build.failed': opts.failed,
              'build.error.message': opts.error.message,
              'build.completed': sinon.match.number,
              'state': ContextVersion.states.buildErrored
            }
          }, { multi: true })
        done()
      })
    })
  })

  describe('findOneCreating', function () {
    var mockContextVersionId = '507f1f77bcf86cd799439011'

    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'findOneAsync')
      done()
    })

    afterEach(function (done) {
      ContextVersion.findOneAsync.restore()
      done()
    })

    it('should throw not found if not exist', function (done) {
      ContextVersion.findOneAsync.resolves()
      ContextVersion.findOneCreating(mockContextVersionId).asCallback(function (err, instance) {
        expect(err).to.be.an.instanceOf(ContextVersion.NotFoundError)
        done()
      })
    })

    it('should throw IncorrectStateError if not in the right state', function (done) {
      var invalidStateCV = {
        _id: '507f1f77bcf86cd799439011',
        state: 'sitting'
      }
      ContextVersion.findOneAsync.resolves(invalidStateCV)
      ContextVersion.findOneCreating(mockContextVersionId).asCallback(function (err, instance) {
        expect(err).to.be.an.instanceOf(ContextVersion.IncorrectStateError)
        done()
      })
    })

    it('should find creating instance', function (done) {
      const mockContextVersion = {
        _id: mockContextVersionId
      }
      ContextVersion.findOneAsync.resolves(mockContextVersion)
      ContextVersion.findOneCreating(mockContextVersionId).asCallback(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.equal(mockContextVersion)
        sinon.assert.calledOnce(ContextVersion.findOneAsync)
        var query = {
          _id: mockContextVersionId
        }
        sinon.assert.calledWith(ContextVersion.findOneAsync, query)
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      ContextVersion.findOneAsync.rejects(mongoError)
      ContextVersion.findOneCreating(mockContextVersionId).asCallback(function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(ContextVersion.findOneAsync)
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
        context: 'context-id'
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
  describe('generateQueryForAppCodeVersions', function () {
    describe('Validations', function () {
      it('should tell us an array is required', function (done) {
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
  describe('#markDockRemovedByDockerHost', function () {
    var dockerHost = '1234'
    beforeEach(function (done) {
      sinon.stub(ContextVersion, 'updateAsync').resolves()
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateAsync.restore()
      done()
    })

    it('should call update with the right parameters', function (done) {
      ContextVersion.markDockRemovedByDockerHost(dockerHost).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(ContextVersion.updateAsync)
        sinon.assert.calledWith(ContextVersion.updateAsync,
          {dockerHost: dockerHost},
          {$set: {dockRemoved: true}},
          {multi: true})
        done()
      })
    })

    it('should pass the database error through to the callback', function (done) {
      var error = new Error('Mongo Error')
      ContextVersion.updateAsync.rejects(error)
      ContextVersion.markDockRemovedByDockerHost(dockerHost).asCallback(function (err) {
        expect(err.message).to.equal(error.message)
        sinon.assert.calledOnce(ContextVersion.updateAsync)
        done()
      })
    })
  })
})
