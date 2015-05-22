'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var expect = require('code').expect;
var sinon = require('sinon');
var optimus = require('optimus/client');

var api = require('../../fixtures/api-control');
var dock = require('../../fixtures/dock');
var multi = require('../../fixtures/multi-factory');
var uuid = require('uuid');
var primus = require('../../fixtures/primus');
var last = require('101/last');

describe('200 POST /contexts/:id/versions/:id/appCodeVersions/:id/actions/applyTransformRules', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../fixtures/clean-ctx')(ctx));
  afterEach(require('../../fixtures/clean-nock'));

  beforeEach(function (done) {
    ctx.optimusResponse = {
      warnings: [],
      results: [
        {
          rule: { action: 'replace', search: 'foo', replace: 'bar' },
          warnings: [],
          nameChanges: [],
          diffs: { '/a.txt': 'foo-bar-diff' }
        },
        {
          rule: { action: 'replace', search: 'bar', replace: 'baz' },
          warnings: [],
          nameChanges: [],
          diffs: { '/a.txt': 'bar-baz-diff' }
        },
        {
          rule: { action: 'replace', search: 'baz', replace: 'bif' },
          warnings: [],
          nameChanges: [],
          diffs: { '/a.txt': 'baz-bif-diff' }
        },
      ],
      diff: 'replace-diff',
      script: 'replace-script'
    };

    ctx.transformRules = {
      exclude: ['a.txt'],
      replace: [
        { action: 'replace', search: 'foo', replace: 'bar' },
        { action: 'replace', search: 'bar', replace: 'baz' },
        { action: 'replace', search: 'baz', replace: 'bif' }
      ],
      rename: [
        { action: 'rename', source: 'w.txt', dest: 'z.txt' },
        { action: 'rename', source: 'z.txt', dest: 'k.txt' },
        { action: 'rename', source: 'k.txt', dest: 'p.txt' }
      ]
    };

    sinon.stub(optimus, 'transform').yieldsAsync(null, {
      body: ctx.optimusResponse
    });

    multi.createContextVersion(function (err, contextVersion, context, build, user) {
      ctx.contextVersion = contextVersion;
      ctx.context = context;
      ctx.user = user;
      ctx.repoName = 'Dat-middleware';
      ctx.fullRepoName = ctx.user.json().accounts.github.login+'/'+ctx.repoName;
      require('../../fixtures/mocks/github/repos-username-repo')(ctx.user, ctx.repoName);
      require('../../fixtures/mocks/github/repos-username-repo-hooks')(ctx.user, ctx.repoName);
      var body = {
        repo: ctx.fullRepoName,
        branch: 'master',
        commit: uuid()
      };
      var username = ctx.user.attrs.accounts.github.login;
      require('../../fixtures/mocks/github/repos-keys-get')(username, ctx.repoName, true);
      ctx.appCodeVersion = ctx.contextVersion.appCodeVersions.models[0];
      done();
    });
  });

  beforeEach(function (done) {
    ctx.appCodeVersion.setTransformRules(ctx.transformRules, function (err, resp) {
      ctx.renameRule = resp.transformRules.rename[1];
      ctx.replaceRule = resp.transformRules.replace[1];
      done();
    });
  });

  afterEach(function (done) {
    optimus.transform.restore();
    done();
  });

  it('should test a new replace rule', function(done) {
    var rule = { action: 'replace', search: 'dood', replace: 'rood' };
    ctx.appCodeVersion.testTransformRule(rule, function (err, resp) {
      if (err) { return done(err); }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results));

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'replace', search: 'foo', replace: 'bar' },
        { action: 'replace', search: 'bar', replace: 'baz' },
        { action: 'replace', search: 'baz', replace: 'bif' },
        rule
      ];

      var optimusRules = optimus.transform.firstCall.args[0].rules;
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key]);
        });
      });
      done();
    });
  });

  it('should test a new rename rule', function(done) {
    var rule = { action: 'rename', source: 'cool.txt', dest: 'world.txt' };
    ctx.appCodeVersion.testTransformRule(rule, function (err, resp) {
      if (err) { return done(err); }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results));

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'rename', source: 'w.txt', dest: 'z.txt' },
        { action: 'rename', source: 'z.txt', dest: 'k.txt' },
        { action: 'rename', source: 'k.txt', dest: 'p.txt' },
        rule
      ];

      var optimusRules = optimus.transform.firstCall.args[0].rules;
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key]);
        });
      });
      done();
    });
  });

  it('should test a change to an existing replace rule', function(done) {
    ctx.appCodeVersion.testTransformRule(ctx.replaceRule, function (err, resp) {
      if (err) { return done(err); }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results));

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'replace', search: 'foo', replace: 'bar' },
        ctx.replaceRule
      ];

      var optimusRules = optimus.transform.firstCall.args[0].rules;
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key]);
        });
      });
      done();
    });
  });

  it('should test a change to an existing rename rule', function(done) {
    ctx.appCodeVersion.testTransformRule(ctx.renameRule, function (err, resp) {
      if (err) { return done(err); }
      expect(resp).to.deep.equal(last(ctx.optimusResponse.results));

      var expectedRuleSet = [
        { action: 'exclude', files: [ 'a.txt' ] },
        { action: 'rename', source: 'w.txt', dest: 'z.txt' },
        ctx.renameRule
      ];

      var optimusRules = optimus.transform.firstCall.args[0].rules;
      expectedRuleSet.forEach(function (expected, index) {
        Object.keys(expected).forEach(function (key) {
          expect(optimusRules[index][key]).to.deep.equal(expected[key]);
        });
      });
      done();
    });
  });
});
