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
