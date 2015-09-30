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

var cbCount = require('callback-count');
var Boom = require('dat-middleware').Boom;
var isObject = require('101/is-object');

var error = require('error');
var Github = require('models/apis/github');
var messenger = require('socket/messenger');

var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var InfraCodeVersion = require('models/mongo/infra-code-version');

var ctx = {};
var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('Context Version: '+moduleName, function () {
  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything);

  beforeEach(function (done) {
    ctx.mockContextVersion = {
      '_id': '55d3ef733e1b620e00eb6292',
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
    };
    ctx.mockContext = {
      '_id': '55d3ef733e1b620e00eb6292',
      name: 'name1',
      owner: {
        github: '2335750'
      },
      createdBy: {
        github: '146592'
      }
    };
    done();
  });
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

  describe('updateBuildCompletedByContainer', function () {
    beforeEach(function (done) {
      sinon.stub(Context, 'findById').yieldsAsync(null, ctx.mockContext);
      sinon.stub(ContextVersion, 'updateBy').yieldsAsync();
      sinon.stub(ContextVersion, 'findBy').yieldsAsync(null, [ctx.mockContextVersion]);
      done();
    });
    afterEach(function (done) {
      Context.findById.restore();
      ContextVersion.updateBy.restore();
      ContextVersion.findBy.restore();
      messenger.emitContextVersionUpdate.restore();
      done();
    });
    it('should save a successful build', function (done) {
      var opts = {
        dockerImage: 'asdasdfgvaw4fgaw323kjh23kjh4gq3kj',
        log: 'adsfasdfasdfadsfadsf',
        failed: false
      };
      var myCv = {id: 12341};

      sinon.stub(messenger, 'emitContextVersionUpdate', function () {
        done();
      });
      ContextVersion.updateBuildCompletedByContainer(myCv, opts, function () {
        expect(ContextVersion.updateBy.calledOnce).to.be.true();
        expect(ContextVersion.findBy.calledOnce).to.be.true();

        var args = ContextVersion.updateBy.getCall(0).args;
        expect(args[0]).to.equal('build.dockerContainer');
        expect(args[1]).to.equal(myCv);
        expect(args[2].$set).to.contains({
          'build.dockerImage': opts.dockerImage,
          'build.log'        : opts.log,
          'build.failed'     : opts.failed
        });
        expect(args[2].$set['build.completed']).to.exist();

      });
    });
    it('should save a failed build', function (done) {
      var opts = {
        log: 'adsfasdfasdfadsfadsf',
        failed: true,
        error: {
          message: 'jksdhfalskdjfhadsf'
        }
      };
      var myCv = {id: 12341};
      sinon.stub(messenger, 'emitContextVersionUpdate', function () {
        done();
      });
      ContextVersion.updateBuildCompletedByContainer(myCv, opts, function () {
        expect(ContextVersion.updateBy.calledOnce).to.be.true();
        expect(ContextVersion.findBy.calledOnce).to.be.true();

        var args = ContextVersion.updateBy.getCall(0).args;
        expect(args[0]).to.equal('build.dockerContainer');
        expect(args[1]).to.equal(myCv);
        expect(args[2].$set).to.contains({
          'build.log'        : opts.log,
          'build.failed'     : opts.failed,
          'error.message'    : opts.error.message
        });
        expect(args[2].$set['build.completed']).to.exist();
      });
    });
  });

  describe('save context version validation', function () {
    it('should not possible to save cv without owner', function (done) {
      var c = new Context();
      var cv = new ContextVersion({
        createdBy: { github: 1000 },
        context: c._id
      });
      cv.save(function (err) {
        expect(err).to.exist();
        expect(err.message).to.equal('Validation failed');
        expect(err.errors.owner.message).to.equal('ContextVersions require an Owner');
        done();
      });
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
              require('../../../test/functional/fixtures/mocks/github/repos-username-repo-branches-branch')(newCv);
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

  describe('addAppCodeVersionQuery', function() {
    var cv;
    var cvNoAppCodeVersions;
    var query;
    var infraCodeVersion = 'HASH';
    var appCodeVersions = [
      { lowerRepo: 'some-repo-name', commit: 'c0ffee' },
      { lowerRepo: 'some-other-name', commit: 'deadbeef' }
    ];

    beforeEach(function (done) {
      query = { infraCodeVersion: infraCodeVersion };
      cv = new ContextVersion({ appCodeVersions: appCodeVersions });
      cvNoAppCodeVersions = new ContextVersion({ appCodeVersions: [] });
      done();
    });

    it('should preserve original query conditions', function(done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query);
      expect(result.infraCodeVersion).to.equal(infraCodeVersion);
      done();
    });

    it('should add app code versions conditions when present', function(done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query);
      expect(result.$and).to.be.an.array();
      expect(result.$and.every(isObject)).to.be.true();
      expect(result.$and.length).to.equal(appCodeVersions.length + 1);
      done();
    });

    it('should add the correct clause for each app code version', function(done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query);
      for (var i = 0; i < 2; i++) {
        expect(result.$and[i].appCodeVersions).to.be.an.object();
        expect(result.$and[i].appCodeVersions.$elemMatch).to.be.an.object();
        var $elemMatch = result.$and[i].appCodeVersions.$elemMatch;
        expect($elemMatch).to.deep.equal(appCodeVersions[i]);
      }
      done();
    });

    it('should add the correct size clause', function(done) {
      var result = ContextVersion.addAppCodeVersionQuery(cv, query);
      var clause = result.$and[result.$and.length-1];
      expect(clause.appCodeVersions).to.be.an.object();
      expect(clause.appCodeVersions.$size).to.equal(appCodeVersions.length);
      done();
    });

    it('should only add the size clause without appCodeVersions', function(done) {
      var result = ContextVersion.addAppCodeVersionQuery(
        cvNoAppCodeVersions,
        query
      );
      expect(result.appCodeVersions).to.be.an.object();
      expect(result.appCodeVersions.$size).to.equal(0);
      done();
    });
  }); // end 'addAppCodeVersionQuery'

  describe('updateBuildHash', function() {
    var cv;

    beforeEach(function (done) {
      cv = new ContextVersion({
        build: { hash: 'old-hash' }
      });
      sinon.stub(cv, 'update').yieldsAsync(null);
      done();
    });

    afterEach(function (done) {
      cv.update.restore();
      done();
    });

    it('should use the correct query', function(done) {
      var hash = 'random-hash';
      var expectedQuery = {
        $set: {
          'build.hash' : hash
        }
      };
      cv.updateBuildHash(hash, function (err) {
        if (err) { return done(err); }
        expect(cv.update.calledOnce).to.be.true();
        expect(cv.update.calledWith(expectedQuery)).to.be.true();
        done();
      });
    });

    it('should set the hash on the context version', function(done) {
      var hash = 'brand-new-hash';
      cv.updateBuildHash(hash, function (err) {
        if (err) { return done(err); }
        expect(cv.build.hash).to.equal(hash);
        done();
      });
    });

    it('should correctly handle update errors', function(done) {
      var updateError = new Error('Update is too cool to work right now.');
      cv.update.yieldsAsync(updateError);
      cv.updateBuildHash('rando', function (err) {
        expect(err).to.exist();
        expect(err).to.equal(updateError);
        done();
      });
    });
  }); // end 'updateBuildHash'

  describe('findPendingDupe', function() {
    var cv;
    var dupe;
    var cvTimestamp = 20;

    beforeEach(function (done) {
      cv = new ContextVersion({
        build: {
          _id: 'id-a',
          hash: 'hash-a',
          started: new Date(cvTimestamp)
        }
      });
      dupe = new ContextVersion({
        build: {
          _id: 'id-b',
          hash: 'hash-b',
          started: new Date(cvTimestamp - 10)
        }
      });
      sinon.stub(ContextVersion, 'find').yieldsAsync(null, [ dupe ]);
      done();
    });

    afterEach(function (done) {
      ContextVersion.find.restore();
      done();
    });

    it('uses the correct ContextVersion.find query', function(done) {
      var expectedQuery = ContextVersion.addAppCodeVersionQuery(cv, {
        'build.completed': { $exists: false },
        'build.hash': cv.build.hash,
        'build._id': { $ne: cv.build._id },
        'advanced': false
      });

      cv.findPendingDupe(function (err) {
        if (err) { return done(err); }
        expect(ContextVersion.find.calledOnce).to.be.true();
        expect(ContextVersion.find.firstCall.args[0])
          .to.deep.equal(expectedQuery);
        done();
      });
    });

    it('uses the correct ContextVersion.find options', function(done) {
      var expectedOptions = {
        sort : 'build.started',
        limit: 1
      };

      cv.findPendingDupe(function (err) {
        if (err) { return done(err); }
        expect(ContextVersion.find.calledOnce).to.be.true();
        expect(ContextVersion.find.firstCall.args[2])
          .to.deep.equal(expectedOptions);
        done();
      });
    });

    it('handles ContextVersion.find errors', function(done) {
      var findError = new Error('API is upset, and does not want to work.');
      ContextVersion.find.yieldsAsync(findError);

      cv.findPendingDupe(function (err) {
        expect(err).to.equal(findError);
        done();
      });
    });

    it('yields null if oldest pending is younger than itself', function(done) {
      ContextVersion.find.yieldsAsync(null, [
        new ContextVersion({
          build: {
            _id: 'id-b',
            hash: 'hash-b',
            started: new Date(cvTimestamp + 10)
          }
        })
      ]);

      cv.findPendingDupe(function (err, pendingDuplicate) {
        if (err) { return done(err); }
        expect(pendingDuplicate).to.be.null();
        done();
      });
    });

    it('yields nothing if the oldest pending is null', function(done) {
      ContextVersion.find.yieldsAsync(null, []);

      cv.findPendingDupe(function (err, pendingDuplicate) {
        if (err) { return done(err); }
        expect(pendingDuplicate).to.not.exist();
        done();
      });
    });

    it('yields the oldest pending duplicate when applicable', function(done) {
      cv.findPendingDupe(function (err, pendingDuplicate) {
        if (err) { return done(err); }
        expect(pendingDuplicate).to.equal(dupe);
        done();
      });
    });
  }); // end 'findPendingDupe'

  describe('findCompletedDupe', function() {
    var cv;
    var dupe;

    beforeEach(function (done) {
      cv = new ContextVersion({
        build: {
          _id: 'id-a',
          hash: 'hash-a'
        }
      });
      dupe = new ContextVersion({
        build: {
          _id: 'id-b',
          hash: 'hash-b'
        }
      });
      sinon.stub(ContextVersion, 'find').yieldsAsync(null, [ dupe ]);
      done();
    });

    afterEach(function (done) {
      ContextVersion.find.restore();
      done();
    });

    it('uses the correct ContextVersion.find query', function(done) {
      var expectedQuery = ContextVersion.addAppCodeVersionQuery(cv, {
        'build.completed': { $exists: true },
        'build.hash': cv.build.hash,
        'build._id': { $ne: cv.build._id },
        'advanced': false
      });

      cv.findCompletedDupe(function (err) {
        if (err) { return done(err); }
        expect(ContextVersion.find.calledOnce).to.be.true();
        expect(ContextVersion.find.firstCall.args[0])
          .to.deep.equal(expectedQuery);
        done();
      });
    });

    it('uses the correct ContextVersion.find options', function(done) {
      var expectedOptions = {
        sort : '-build.started',
        limit: 1
      };

      cv.findCompletedDupe(function (err) {
        if (err) { return done(err); }
        expect(ContextVersion.find.calledOnce).to.be.true();
        expect(ContextVersion.find.firstCall.args[2])
          .to.deep.equal(expectedOptions);
        done();
      });
    });

    it('yields the correct duplicate', function(done) {
      cv.findCompletedDupe(function (err, completedDupe) {
        if (err) { return done(err); }
        expect(completedDupe).to.equal(dupe);
        done();
      });
    });
  }); // end 'findCompletedDupe'

  describe('dedupeBuild', function() {
    var cv;
    var dupe;
    var hash = 'icv-hash';

    beforeEach(function (done) {
      cv = new ContextVersion({
        infraCodeVersion: 'infra-code-version-id',
        owner: { github: 1 }
      });
      dupe = new ContextVersion({
        infraCodeVersion: 'infra-code-version-id',
        owner: { github: 1 }
      });
      sinon.stub(InfraCodeVersion, 'findByIdAndGetHash')
        .yieldsAsync(null, hash);
      sinon.stub(cv, 'updateBuildHash').yieldsAsync();
      sinon.stub(cv, 'findPendingDupe').yieldsAsync(null, dupe);
      sinon.stub(cv, 'findCompletedDupe').yieldsAsync(null, dupe);
      sinon.stub(cv, 'copyBuildFromContextVersion')
        .yieldsAsync(null, dupe);
      done();
    });

    afterEach(function (done) {
      InfraCodeVersion.findByIdAndGetHash.restore();
      cv.updateBuildHash.restore();
      cv.findPendingDupe.restore();
      cv.findCompletedDupe.restore();
      cv.copyBuildFromContextVersion.restore();
      done();
    });

    it('should find the hash via InfraCodeVersion', function(done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err); }
        expect(InfraCodeVersion.findByIdAndGetHash.calledOnce).to.be.true();
        expect(InfraCodeVersion.findByIdAndGetHash.calledWith(
          cv.infraCodeVersion
        )).to.be.true();
        done();
      });
    });

    it('should set the hash returned by InfraCodeVersion', function(done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err); }
        expect(cv.updateBuildHash.calledOnce).to.be.true();
        expect(cv.updateBuildHash.calledWith(hash)).to.be.true();
        done();
      });
    });

    it('should find pending duplicates', function(done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err); }
        expect(cv.findPendingDupe.calledOnce).to.be.true();
        done();
      });
    });

    it('should not find completed duplicates with one pending', function(done) {
      cv.dedupeBuild(function (err) {
        if (err) { return done(err); }
        expect(cv.findCompletedDupe.callCount).to.equal(0);
        done();
      });
    });

    it('should find completed duplicates without one pending', function(done) {
      cv.findPendingDupe.yieldsAsync(null, null);

      cv.dedupeBuild(function (err) {
        if (err) { return done(err); }
        expect(cv.findCompletedDupe.calledOnce).to.be.true();
        done();
      });
    });

    it('should handle completed duplicate lookup errors', function(done) {
      var completedErr = new Error('API is not feeling well, try later.');
      cv.findPendingDupe.yieldsAsync(null, null);
      cv.findCompletedDupe.yieldsAsync(completedErr, null);

      cv.dedupeBuild(function (err) {
        expect(err).to.equal(completedErr);
        done();
      });
    });

    it('should dedupe cvs with the same owner', function(done) {
      cv.dedupeBuild(function (err, result) {
        if (err) { done(err); }
        expect(result).to.equal(dupe);
        done();
      });
    });

    it('should not dedupe a cv with a different owner', function(done) {
      dupe.owner.github = 2;
      cv.dedupeBuild(function (err, result) {
        if (err) { done(err); }
        expect(result).to.equal(cv);
        done();
      });
    });

    it('should replace itself if a duplicate was found', function(done) {
      cv.dedupeBuild(function (err) {
        if (err) { done(err); }
        expect(cv.copyBuildFromContextVersion.calledOnce).to.be.true();
        expect(cv.copyBuildFromContextVersion.calledWith(dupe))
          .to.be.true();
        done();
      });
    });

    it('should not replace itself without a duplicate', function(done) {
      cv.findPendingDupe.yieldsAsync(null, null);
      cv.findCompletedDupe.yieldsAsync(null, null);

      cv.dedupeBuild(function (err) {
        if (err) { done(err); }
        expect(cv.copyBuildFromContextVersion.callCount).to.equal(0);
        expect(cv.copyBuildFromContextVersion.calledWith(dupe))
          .to.be.false();
        done();
      });
    });
  }); // end 'dedupeBuild'
});
