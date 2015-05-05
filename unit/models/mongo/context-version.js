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

var sinon = require('sinon');

var ctx = {};
describe('Context Version', function () {
  before(require('../../fixtures/mongo').connect);
  afterEach(require('../../../test/fixtures/clean-mongo').removeEverything);

  describe('addGithubRepoToVersion', function () {
    beforeEach(function (done) {
      ctx.c = new Context();
      ctx.cv = new ContextVersion({
        createdBy: { github: 1000 },
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
