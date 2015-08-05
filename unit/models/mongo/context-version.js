'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var Github = require('models/apis/github');

var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var cbCount = require('callback-count');
var error = require('error');
var sinon = require('sinon');

var ctx = {};
describe('Context Version', function () {
  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/fixtures/clean-mongo').removeEverything);

  describe('save context version hook', function () {
    it('should call post save hook and report error when owner is undefiend', function (done) {
      var next = cbCount(2, done).next;
      sinon.stub(error, 'log', function (err) {
        expect(err.output.statusCode).to.equal(500);
        expect(err.message).to.equal('context version was saved without owner');
        expect(err.data.cv._id).to.exist();
        error.log.restore();
        next();
      });
      var c = new Context();
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        context: c._id
      });
      cv.save(next);
    });
  });

  describe('addGithubRepoToVersion', function () {
    beforeEach(function (done) {
      ctx.c = new Context();
      ctx.cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: ctx.c._id
      });
      ctx.cv.save(done);
    });

    it('should add a repo and save the correct default branch', function (done) {
      var user = {
        accounts: { github: { accessToken: '00' } }
      };
      var repoInfo = {
        repo: 'bkendall/flaming-octo-nemesis',
        branch: 'master',
        commit: '1234abcd'
      };
      sinon.stub(Github.prototype, 'getRepo', function (repo, cb) { cb(null, {
        'default_branch': 'not-master'
      }); });
      sinon.stub(Github.prototype, 'createRepoHookIfNotAlready', function (repo, cb) { cb(); });
      sinon.stub(Github.prototype, 'addDeployKeyIfNotAlready', function (repo, cb) {
        cb(null, { privateKey: 'private', publicKey: 'public' });
      });
      ContextVersion.addGithubRepoToVersion(user, ctx.cv.id, repoInfo, function (err) {
        if (err) { return done(err); }
        Github.prototype.getRepo.restore();
        Github.prototype.createRepoHookIfNotAlready.restore();
        Github.prototype.addDeployKeyIfNotAlready.restore();

        ContextVersion.findOne({ _id: ctx.cv._id }, function (findErr, doc) {
          if (findErr) { return done(findErr); }
          expect(doc.appCodeVersions[0].defaultBranch).to.equal('not-master');
          done();
        });
      });
    });
  });

  describe('modifyAppCodeVersionWithLatestCommit', function () {
    it('should return current same cv if no acs were found', function (done) {
      var c = new Context();
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id
      });
      cv.modifyAppCodeVersionWithLatestCommit({id: 'some-id'}, function (err, updatedCv) {
        expect(err).to.be.null();
        expect(updatedCv).to.deep.equal(cv);
        done();
      });
    });

    it('should return same cv if all acvs have userLatest=false', function (done) {
      var c = new Context();
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      };
      var acv2 = {
        repo: 'codenow/api',
        branch: 'master',
        additionalRepo: true
      };
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id,
      });
      cv.save(function  (err) {
        if (err) {
          return done(err);
        }
        cv.update({$pushAll: {appCodeVersions: [acv1, acv2]}},{ safe: true, upsert: true },
          function (err) {
            if (err) {
              return done(err);
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err);
              }
              newCv.modifyAppCodeVersionWithLatestCommit({id: 'some-id'}, function (err, updatedCv) {
                expect(err).to.be.null();
                expect(updatedCv).to.deep.equal(newCv);
                done();
              });
            });
          });
      });
    });
    it('should update acv with latest commit if userLatest=true', function (done) {
      var c = new Context();
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      };
      var acv2 = {
        repo: 'codenow/api',
        branch: 'master',
        additionalRepo: true
      };
      var acv3 = {
        repo: 'codenow/web',
        branch: 'master',
        additionalRepo: true,
        useLatest: true
      };
      var acv4 = {
        repo: 'codenow/docker-listener',
        branch: 'master',
        additionalRepo: true,
        useLatest: true
      };
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id,
      });
      cv.save(function  (err) {
        if (err) {
          return done(err);
        }
        cv.update({$pushAll: {appCodeVersions: [acv1, acv2, acv3, acv4]}},
          { safe: true, upsert: true },
          function (err) {
            if (err) {
              return done(err);
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err);
              }
              require('../../../test/fixtures/mocks/github/repos-username-repo-branches-branch')(newCv);
              newCv.modifyAppCodeVersionWithLatestCommit({id: 'some-id'}, function (err, updatedCv) {
                expect(err).to.be.null();
                expect(updatedCv.appCodeVersions[0].commit).to.be.undefined();
                expect(updatedCv.appCodeVersions[1].commit).to.be.undefined();
                expect(updatedCv.appCodeVersions[2].commit).to.have.length(40);
                expect(updatedCv.appCodeVersions[3].commit).to.have.length(40);
                done();
              });
            });
          });
      });
    });
  });
});
