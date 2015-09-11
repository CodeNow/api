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
var sinon = require('sinon');

var Github = require('models/apis/github');

var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var cbCount = require('callback-count');
var error = require('error');
var Boom = require('dat-middleware').Boom;
var InfraCodeVersion = require('models/mongo/infra-code-version');

var ctx = {};
describe('Context Version', function () {
  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/fixtures/clean-mongo').removeEverything);

  describe('updateBuildErrorByContainer', function () {
    it('should save the logs as an array', function (done) {
      sinon.stub(ContextVersion, 'updateBy').yields();
      sinon.stub(ContextVersion, 'findBy').yields();

      var err = Boom.badRequest('message', {
        docker: {
          log: [{ some: 'object' }]
        }
      });

      ContextVersion.updateBuildErrorByContainer('', err, function () {
        expect(ContextVersion.updateBy.calledOnce).to.be.true();
        // expect(ContextVersion.findBy.calledOnce).to.be.true();

        var args = ContextVersion.updateBy.getCall(0).args;
        expect(args[0]).to.equal('build.dockerContainer');
        expect(args[1]).to.equal('');
        expect(args[2].$set['build.log']).to.deep.equal([{
          some: 'object'
        }]);

        ContextVersion.updateBy.restore();
        ContextVersion.findBy.restore();
        done();
      });
    });
  });

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

  describe('log streams primus', function () {
    it('should be fine if we do not pass it a callback', function (done) {
      var cv = new ContextVersion({
        build: { log: 'hello\nworld\n' }
      });
      var cache = [];
      var stream = {
        write: function (data) { cache.push(data); },
        end: function () { done(); }
      };
      // this will call stream.end for us
      cv.writeLogsToPrimusStream(stream);
    });
    it('should write objects to primus from a string log', function (done) {
      var cv = new ContextVersion({
        build: { log: 'hello\nworld\n' }
      });
      var cache = [];
      var stream = {
        write: function (data) { cache.push(data); },
        end: sinon.stub()
      };
      cv.writeLogsToPrimusStream(stream, function (err) {
        if (err) { return done(err); }
        expect(cache).to.have.length(3);
        expect(cache).to.deep.equal([{
          type: 'log',
          content: 'hello'
        }, {
          type: 'log',
          content: 'world'
        }, {
          type: 'log',
          content: ''
        }]);
        expect(stream.end.callCount).to.equal(1);
        done();
      });
    });

    it('should return objects from an array of objects', function (done) {
      var cv = new ContextVersion({
        build: {
          log: [{
            type: 'log',
            content: 'hello'
          }, {
            type: 'log',
            content: 'world'
          }]
        }
      });
      var cache = [];
      var stream = {
        write: function (data) { cache.push(data); },
        end: sinon.stub()
      };
      cv.writeLogsToPrimusStream(stream, function (err) {
        if (err) { return done(err); }
        expect(cache).to.have.length(2);
        expect(cache).to.deep.equal([{
          type: 'log',
          content: 'hello'
        }, {
          type: 'log',
          content: 'world'
        }]);
        expect(stream.end.callCount).to.equal(1);
        done();
      });
    });
  });

  describe('addGithubRepoToVersion', function () {
    beforeEach(function (done) {
      ctx.c = new Context();
      ctx.cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: { github: 2874589 },
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

  describe('modifyAppCodeVersion', function () {
    it('should return cv updated with branch', function (done) {
      var c = new Context();
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      };
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id
      });
      cv.save(function  (err) {
        if (err) {
          return done(err);
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}},{ safe: true, upsert: true },
          function (err) {
            if (err) {
              return done(err);
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err);
              }
              newCv.modifyAppCodeVersion(newCv.appCodeVersions[0]._id,
                {branch: 'Some-branch'},
                function (err, updatedCv) {
                  expect(err).to.be.null();
                  expect(updatedCv.appCodeVersions[0].branch).to.equal('Some-branch');
                  expect(updatedCv.appCodeVersions[0].lowerBranch).to.equal('some-branch');
                  done();
                });
            });
          });
      });
    });
    it('should return cv updated with commit', function (done) {
      var c = new Context();
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      };
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id
      });
      cv.save(function  (err) {
        if (err) {
          return done(err);
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}},{ safe: true, upsert: true },
          function (err) {
            if (err) {
              return done(err);
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err);
              }
              newCv.modifyAppCodeVersion(newCv.appCodeVersions[0]._id,
                {commit: 'd5a527f959342c2e00151612be973c89b9fa7078'},
                function (err, updatedCv) {
                  expect(err).to.be.null();
                  expect(updatedCv.appCodeVersions[0].commit).to.equal('d5a527f959342c2e00151612be973c89b9fa7078');
                  done();
                });
            });
          });
      });
    });
    it('should return cv updated with useLatest flag', function (done) {
      var c = new Context();
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      };
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id
      });
      cv.save(function  (err) {
        if (err) {
          return done(err);
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}},{ safe: true, upsert: true },
          function (err) {
            if (err) {
              return done(err);
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err);
              }
              newCv.modifyAppCodeVersion(newCv.appCodeVersions[0]._id, {useLatest: true}, function (err, updatedCv) {
                expect(err).to.be.null();
                expect(updatedCv.appCodeVersions[0].useLatest).to.be.true();
                done();
              });
            });
          });
      });
    });
    it('should return cv updated with transformRules', function (done) {
      var c = new Context();
      var acv1 = {
        repo: 'codenow/hellonow',
        branch: 'master'
      };
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        owner: {github: 2874589},
        context: c._id
      });
      cv.save(function  (err) {
        if (err) {
          return done(err);
        }
        cv.update({$pushAll: {appCodeVersions: [acv1]}},{ safe: true, upsert: true },
          function (err) {
            if (err) {
              return done(err);
            }
            ContextVersion.findById(cv._id, function (err, newCv) {
              if (err) {
                return done(err);
              }
              var transformRules = {
                exclude: ['a.txt']
              };
              newCv.modifyAppCodeVersion(newCv.appCodeVersions[0]._id,
                {transformRules: transformRules},
                function (err, updatedCv) {
                  expect(err).to.be.null();
                  expect(updatedCv.appCodeVersions[0].transformRules.exclude).to.deep.equal(transformRules.exclude);
                  done();
                });
            });
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
  }); // end 'modifyAppCodeVersionWithLatestCommit'

  describe('dedupeBuild', function() {
    var version;
    var dupe;

    beforeEach(function (done) {
      version = new ContextVersion({
        infraCodeVersion: 'infra-code-version-id',
        owner: { github: 1 }
      });
      dupe = new ContextVersion({
        infraCodeVersion: 'infra-code-version-id',
        owner: { github: 1 }
      });
      sinon.stub(InfraCodeVersion, 'findByIdAndGetHash').yieldsAsync(null, 'hash');
      sinon.stub(version, 'setHash').yieldsAsync();
      sinon.stub(version, 'findPendingDupe').yieldsAsync(null, dupe);
      sinon.stub(version, 'findCompletedDupe').yieldsAsync(null, dupe);
      sinon.stub(version, 'copyBuildFromContextVersion').yieldsAsync(null, dupe);
      done();
    });

    afterEach(function (done) {
      InfraCodeVersion.findByIdAndGetHash.restore();
      version.setHash.restore();
      version.findPendingDupe.restore();
      version.findCompletedDupe.restore();
      version.copyBuildFromContextVersion.restore();
      done();
    });

    it('should dedupe versions with the same github owner', function(done) {
      version.dedupeBuild(function (err) {
        if (err) { done(err); }
        expect(version.copyBuildFromContextVersion.calledWith(dupe))
          .to.be.true();
        done();
      });
    });

    it('should not dedupe a version with a different github owner', function(done) {
      dupe.owner.github = 2;
      version.dedupeBuild(function (err) {
        if (err) { done(err); }
        expect(version.copyBuildFromContextVersion.calledWith(dupe))
          .to.be.false();
        done();
      });
    });
  }); // end 'dedupeBuild'
});
