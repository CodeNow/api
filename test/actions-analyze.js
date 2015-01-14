var Lab = require('lab');
var after = Lab.after;
var afterEach = Lab.afterEach;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var describe = Lab.experiment;
var expect = Lab.expect;
var it = Lab.test;

var api = require('./fixtures/api-control');
var generateKey = require('./fixtures/key-factory');
var hooks = require('./fixtures/analyze-hooks');
var multi = require('./fixtures/multi-factory');
var nock = require('nock');
//var repoMock = require('./fixtures/mocks/github/repo');
var repoContentsMock = require('./fixtures/mocks/github/repos-contents');

var javascript_nodejs = 'node';

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Analyze - /actions/analyze', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      ctx.user = user;
      ctx.request = user.client.request;
      done();
    });
  });
  //afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('Error conditions', function () {
    it('should return 400 code without a "repo" query parameter', function (done) {
      ctx.request.get(
        hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(400);
          expect(res.body.message).to.equal('query parameter "repo" must be a string');
          done();
      });
    });

    it('should return 400 code for repository with no recognized dependency file', function (done) {
      repoContentsMock.repoContentsDirectory([{
        name: "README.md"
      }]);
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(400);
          expect(res.body.message).to.equal('unknown language/framework type');
          done();
      });
    });
  });

  describe('Success conditions', function () {
    it('returns 0 inferred suggestions for JavaScript/NodeJS '+
       'repository with 0 dependencies', function (done) {
      var packageFile = {
        dependencies: {}
      };
      repoContentsMock.repoContentsDirectory();
      repoContentsMock.repoContentsFile({
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile, 'utf8')).toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 0 inferred suggestions for JavaScript/NodeJS '+
       'repository with 0 matching dependencies and X non-matching dependencies', function (done) {
      var packageFile = {
        dependencies: {
          '101': '>=5.0.0',
          'dat-middlware': '0.0.0'
        }
      };
      repoContentsMock.repoContentsDirectory();
      repoContentsMock.repoContentsFile({
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile, 'utf8')).toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 1 inferred suggestion for JavaScript/NodeJS '+
       'repository with 1 matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodb': '>=5.0.0'
        }
      };
      repoContentsMock.repoContentsDirectory();
      repoContentsMock.repoContentsFile({
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile, 'utf8')).toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(1);
          done();
        }
      );
    });

    it('returns 3 inferred suggestions for JavaScript/NodeJS '+
       'repository with 3 matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodb': '>=5.0.0',
          'redis': '>=5.0.0',
          'mysql': '>=5.0.0',
          'somethingfake': '0.0.0'
        }
      };
      repoContentsMock.repoContentsDirectory();
      repoContentsMock.repoContentsFile({
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile, 'utf8')).toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(3);
          done();
        }
      );
    });

    it('returns 1 inferred suggestion for JavaScript/NodeJS '+
       'repository with dependency that is a substring of matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodude': '>=5.0.0',
        }
      };
      repoContentsMock.repoContentsDirectory();
      repoContentsMock.repoContentsFile({
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile, 'utf8')).toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(1);
          expect(res.body.serviceDependencies[0]).to.equal('mongodb');
          done();
        }
      );
    });

    it('returns 0 inferred suggestion for JavaScript/NodeJS '+
       'repository with no dependency property in package.json file', function (done) {
      var packageFile = {};
      repoContentsMock.repoContentsDirectory();
      repoContentsMock.repoContentsFile({
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile, 'utf8')).toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

  });
});
