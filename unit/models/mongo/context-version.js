'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')

var ContextVersion = require('models/mongo/context-version')
var InfraCodeVersion = require('models/mongo/infra-code-version')
var Promise = require('bluebird')
require('sinon-as-promised')(Promise)

describe('Context Version Unit Test', function () {
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

  describe('findPendingDupe', function () {
    var cv
    var dupe
    var cvTimestamp = 20

    beforeEach(function (done) {
      cv = {
        appCodeVersions: [],
        build: {
          _id: 'id-a',
          hash: 'hash-a',
          started: new Date(cvTimestamp)
        },
        owner: {
          github: 212
        }
      }
      dupe = {
        appCodeVersions: [],
        build: {
          _id: 'id-b',
          hash: 'hash-b',
          started: new Date(cvTimestamp - 10)
        },
        owner: {
          github: 212
        }
      }
      sinon.stub(ContextVersion, 'findOneAsync').resolves(dupe)
      done()
    })

    afterEach(function (done) {
      ContextVersion.findOneAsync.restore()
      done()
    })

    it('uses the correct ContextVersion.findOneAsync query', function (done) {
      var expectedQuery = ContextVersion.addAppCodeVersionQuery(cv, {
        'build.completed': {$exists: false},
        'build.hash': cv.build.hash,
        'build._id': {$ne: cv.build._id},
        'build.failed': { $ne: true },
        'owner.github': cv.owner.github,
        $or: [
          { 'buildDockerfilePath': { $exists: false } },
          { 'buildDockerfilePath': null }
        ]
      })

      ContextVersion.findPendingDupe(cv)
        .then(function () {
          expect(ContextVersion.findOneAsync.calledOnce).to.be.true()
          expect(ContextVersion.findOneAsync.firstCall.args[0])
            .to.deep.equal(expectedQuery)
        })
        .asCallback(done)
    })

    it('uses the correct ContextVersion.find options', function (done) {
      var expectedOptions = {
        sort: 'build.started',
        limit: 1
      }

      ContextVersion.findPendingDupe(cv)
        .then(function () {
          expect(ContextVersion.findOneAsync.calledOnce).to.be.true()
          expect(ContextVersion.findOneAsync.firstCall.args[2])
            .to.deep.equal(expectedOptions)
        })
        .asCallback(done)
    })

    it('handles ContextVersion.find errors', function (done) {
      var findError = new Error('API is upset, and does not want to work.')
      ContextVersion.findOneAsync.rejects(findError)

      ContextVersion.findPendingDupe(cv)
        .catch(function (err) {
          expect(err).to.equal(findError)
        })
        .asCallback(done)
    })

    it('yields null if oldest pending is younger than itself', function (done) {
      ContextVersion.findOneAsync.resolves({
        appCodeVersions: [],
        build: {
          _id: 'id-b',
          hash: 'hash-b',
          started: new Date(cvTimestamp + 10)
        },
        owner: {
          github: 212
        }
      })

      ContextVersion.findPendingDupe(cv)
        .then(function (pendingDuplicate) {
          expect(pendingDuplicate).to.be.undefined()
        })
        .asCallback(done)
    })

    it('yields nothing if the oldest pending is null', function (done) {
      ContextVersion.findOneAsync.resolves()

      ContextVersion.findPendingDupe(cv)
        .then(function (pendingDuplicate) {
          expect(pendingDuplicate).to.not.exist()
        })
        .asCallback(done)
    })

    it('yields the oldest pending duplicate when applicable', function (done) {
      ContextVersion.findPendingDupe(cv)
        .then(function (pendingDuplicate) {
          expect(pendingDuplicate).to.equal(dupe)
        })
        .asCallback(done)
    })
  })

  describe('findCompletedDupe', function () {
    var cv
    var dupe

    beforeEach(function (done) {
      cv = {
        advanced: false,
        appCodeVersions: [],
        build: {
          _id: 'id-a',
          hash: 'hash-a',
          started: new Date()
        },
        owner: {
          github: 212
        }
      }
      dupe = {
        appCodeVersions: [],
        build: {
          _id: 'id-b',
          hash: 'hash-b',
          started: new Date(),
          completed: new Date()
        },
        owner: {
          github: 212
        }
      }
      sinon.stub(ContextVersion, 'findOneAsync').resolves(dupe)
      done()
    })

    afterEach(function (done) {
      ContextVersion.findOneAsync.restore()
      done()
    })

    it('uses the correct ContextVersion.findOneAsync query', function (done) {
      var expectedQuery = ContextVersion.addAppCodeVersionQuery(cv, {
        'build.completed': {$exists: true},
        'build.hash': cv.build.hash,
        'build._id': {$ne: cv.build._id},
        'build.failed': { $ne: true },
        'owner.github': cv.owner.github,
        advanced: false,
        $or: [
          {'buildDockerfilePath': {$exists: false}},
          {'buildDockerfilePath': null}
        ]
      })

      ContextVersion.findCompletedDupe(cv)
        .then(function () {
          expect(ContextVersion.findOneAsync.calledOnce).to.be.true()
          expect(ContextVersion.findOneAsync.firstCall.args[0])
            .to.deep.equal(expectedQuery)
        })
        .asCallback(done)
    })

    it('uses the correct ContextVersion.find options', function (done) {
      var expectedOptions = {
        sort: '-build.started',
        limit: 1
      }

      ContextVersion.findCompletedDupe(cv)
        .then(function () {
          expect(ContextVersion.findOneAsync.calledOnce).to.be.true()
          expect(ContextVersion.findOneAsync.firstCall.args[2])
            .to.deep.equal(expectedOptions)
        })
        .asCallback(done)
    })

    it('yields the correct duplicate', function (done) {
      ContextVersion.findCompletedDupe(cv)
        .then(function (completedDupe) {
          expect(completedDupe).to.equal(dupe)
        })
        .asCallback(done)
    })

    it('handles ContextVersion.findOneAsync errors', function (done) {
      var findError = new Error('API is upset, and does not want to work.')
      ContextVersion.findOneAsync.rejects(findError)

      ContextVersion.findCompletedDupe(cv)
        .catch(function (err) {
          expect(err).to.equal(findError)
        })
        .asCallback(done)
    })
  })

  describe('updateBuildHash', function () {
    var cv
    beforeEach(function (done) {
      cv = {
        _id: 'asdasdsadsad',
        build: { hash: 'old-hash' }
      }
      sinon.stub(ContextVersion, 'findByIdAndUpdateAsync').resolves(null)
      done()
    })

    afterEach(function (done) {
      ContextVersion.findByIdAndUpdateAsync.restore()
      done()
    })

    it('should use the correct query', function (done) {
      var hash = 'random-hash'
      var expectedQuery = {
        $set: {
          'build.hash': hash
        }
      }
      ContextVersion.updateBuildHash(cv, hash)
        .then(function () {
          expect(ContextVersion.findByIdAndUpdateAsync.calledOnce).to.be.true()
          sinon.assert.calledWith(
            ContextVersion.findByIdAndUpdateAsync,
            cv._id,
            expectedQuery
          )
        })
        .asCallback(done)
    })

    it('should correctly handle update errors', function (done) {
      var hash = 'brand-new-hash'
      var updateError = new Error('Update is too cool to work right now.')
      ContextVersion.findByIdAndUpdateAsync.rejects(updateError)
      ContextVersion.updateBuildHash('rando', hash)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(updateError)
          done()
        })
    })
  })

  describe('dedupeBuild', function () {
    var cv
    var dupe
    var hash = 'icv-hash'

    beforeEach(function (done) {
      cv = {
        infraCodeVersion: 'infra-code-version-id',
        owner: { github: 1 }
      }
      dupe = {
        infraCodeVersion: 'infra-code-version-id',
        appCodeVersions: [],
        build: {
          _id: 'id-b',
          hash: 'hash-b',
          started: new Date(),
          completed: new Date()
        },
        owner: {
          github: 212
        }
      }
      sinon.stub(InfraCodeVersion, 'findByIdAndGetHashAsync').resolves(hash)
      sinon.stub(ContextVersion, 'updateBuildHash').resolves(cv)
      sinon.stub(ContextVersion, 'findPendingDupe').resolves(dupe)
      sinon.stub(ContextVersion, 'findCompletedDupe').resolves(dupe)
      sinon.stub(ContextVersion, 'copyBuildFromContextVersion').resolves(dupe)
      done()
    })

    afterEach(function (done) {
      InfraCodeVersion.findByIdAndGetHashAsync.restore()
      ContextVersion.updateBuildHash.restore()
      ContextVersion.findPendingDupe.restore()
      ContextVersion.findCompletedDupe.restore()
      ContextVersion.copyBuildFromContextVersion.restore()
      done()
    })

    it('should find the hash via InfraCodeVersion', function (done) {
      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(InfraCodeVersion.findByIdAndGetHashAsync.calledOnce).to.be.true()
          expect(InfraCodeVersion.findByIdAndGetHashAsync.calledWith(
            cv.infraCodeVersion
          )).to.be.true()
        })
        .asCallback(done)
    })

    it('should set the hash returned by InfraCodeVersion', function (done) {
      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(ContextVersion.updateBuildHash.calledOnce).to.be.true()
          sinon.assert.calledWith(
            ContextVersion.updateBuildHash,
            cv,
            hash
          )
        })
        .asCallback(done)
    })

    it('should find pending duplicates when none completed', function (done) {
      ContextVersion.findCompletedDupe.resolves()
      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(ContextVersion.findPendingDupe.calledOnce).to.be.true()
        })
        .asCallback(done)
    })

    it('should find completed duplicates if one exists', function (done) {
      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(ContextVersion.findCompletedDupe.calledOnce).to.be.true()
        })
        .asCallback(done)
    })

    it('should not find pending duplicates with one completed', function (done) {
      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(ContextVersion.findPendingDupe.notCalled).to.be.true()
        })
        .asCallback(done)
    })

    it('should handle completed duplicate lookup errors', function (done) {
      var completedErr = new Error('API is not feeling well, try later.')
      ContextVersion.findCompletedDupe.rejects(completedErr)

      ContextVersion.dedupeBuild(cv)
        .catch(function (err) {
          expect(err).to.equal(completedErr)
        })
        .asCallback(done)
    })

    it('should handle pending duplicate lookup errors', function (done) {
      var completedErr = new Error('API is not feeling well, try later.')
      ContextVersion.findCompletedDupe.resolves()
      ContextVersion.findPendingDupe.rejects(completedErr)

      ContextVersion.dedupeBuild(cv)
        .asCallback(function (err) {
          expect(err).to.equal(completedErr)
          done()
        })
    })

    it('should dedupe cvs with the same owner', function (done) {
      ContextVersion.dedupeBuild(cv)
        .then(function (result) {
          expect(result).to.equal(dupe)
        })
        .asCallback(done)
    })

    it('should replace itself if a duplicate was found', function (done) {
      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(ContextVersion.copyBuildFromContextVersion.calledOnce).to.be.true()
          sinon.assert.calledWith(
            ContextVersion.copyBuildFromContextVersion,
            cv,
            dupe
          )
        })
        .asCallback(done)
    })

    it('should not replace itself without a duplicate', function (done) {
      ContextVersion.findPendingDupe.resolves(null)
      ContextVersion.findCompletedDupe.resolves(null)

      ContextVersion.dedupeBuild(cv)
        .then(function () {
          expect(ContextVersion.copyBuildFromContextVersion.callCount).to.equal(0)
          expect(ContextVersion.copyBuildFromContextVersion.calledWith(dupe))
            .to.be.false()
        })
        .asCallback(done)
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
})
