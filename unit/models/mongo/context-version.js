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

  describe('log streams primus', function () {
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
});
