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
var fs = require('fs');

var repoMock = require('./fixtures/mocks/github/repo');
var repoContentsMock = require('./fixtures/mocks/github/repos-contents');

var javascript_nodejs = 'nodejs';
var python = 'python';
var ruby_ror = 'ruby_ror';

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
      repoContentsMock.repoContentsDirectory('python', {});
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(400);
          expect(res.body.message).to.equal('unknown language/framework type');
          done();
      });
    });
  });

  /**
   * Testing backup method of language/dependency inferrence using GitHub Repo API
   * Backup method used when no dependency file detected in project. We can infer language
   * but no dependencies
   */
  describe('Success conditions - unknown', function () {
    it('should successfully identify language as JavaScript w/ no package.json '+
       'present & GitHub API indicates JavaScript', function (done) {
      repoContentsMock.repoContentsDirectory('unknown', {});
      repoMock.standardRepo({language: 'JavaScript'});
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

    it('should successfully identify language as Python w/ no requirements.txt '+
       'present & GitHub API indicates Python', function (done) {
      repoContentsMock.repoContentsDirectory('unknown', {});
      repoMock.standardRepo({language: 'Python'});
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('should successfully identify language as Ruby w/ no Gemfile '+
       'present & GitHub API indicates Ruby', function (done) {
      repoContentsMock.repoContentsDirectory('unknown', {});
      repoMock.standardRepo({language: 'Ruby'});
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });
  });

  describe('Success conditions - python', function () {
    it('returns 0 inferred suggestions for python '+
       'repository with 0 dependencies', function (done) {
      var requirements = '';
      repoContentsMock.repoContentsDirectory('python', {});
      repoContentsMock.repoContentsFile('python', {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: (new Buffer(requirements, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

   it('returns 0 inferred suggestions for python '+
       'repository with 0 MATCHING dependencies', function (done) {
      var requirements = 'Django==1.3\n'+
        'stripe\n'+
        'py-bcrypt';
      repoContentsMock.repoContentsDirectory('python', {});
      repoContentsMock.repoContentsFile('python', {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: (new Buffer(requirements, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 1 inferred suggestions for python '+
       'repository with 1 matching dependency', function (done) {
      var requirements = 'Django==1.3\n'+
        'stripe\n'+
        'Eve-Elastic\n'+ //matching dependency
        'py-bcrypt';
      repoContentsMock.repoContentsDirectory('python', {});
      repoContentsMock.repoContentsFile('python', {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: (new Buffer(requirements, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(1);
          expect(res.body.serviceDependencies[0]).to.equal('ElasticSearch');
          done();
        }
      );
    });

    it('returns 3 inferred suggestions for python '+
       'repository with 3 matching dependency', function (done) {
      var requirements = 'Django==1.3\n'+
        'stripe\n'+
        'Eve-Elastic==0.10.0\n'+ //matching dependency (ElasticSearch)
        'fooddep\n'+
        'casscache\n'+ //matching (memcached)
        'Djamo\n'+ //matching (mongodb)
        'py-bcrypt';
      repoContentsMock.repoContentsDirectory('python', {});
      repoContentsMock.repoContentsFile('python', {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: (new Buffer(requirements, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(3);
          expect(res.body.serviceDependencies[0]).to.equal('ElasticSearch');
          expect(res.body.serviceDependencies[1]).to.equal('memcached');
          expect(res.body.serviceDependencies[2]).to.equal('mongodb');
          done();
        }
      );
    });

    it('returns 0 inferred suggestions for python '+
       'repository with dependency that is a substring of matching dependency', function (done) {
      var requirements = 'Django==1.3\n'+
        'stripe\n'+
        'Eve-Ela==0.10.0\n'+ //matching dependency SUBSTRING (ElasticSearch)
        'fooddep\n'+
        'cassc\n'+ //matching SUBSTRING (memcached)
        'Dj\n'+ //matching SUBSTRING (mongodb)
        'py-bcrypt';
      repoContentsMock.repoContentsDirectory('python', {});
      repoContentsMock.repoContentsFile('python', {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: (new Buffer(requirements, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 1 inferred suggestions for python '+
       'repository with multiple matching known modules', function (done) {
      // 3 matching known dependencies
      var requirements = 'elasticstack\n'+
        'elasticsearch\n'+
        'elong';
      repoContentsMock.repoContentsDirectory('python', {});
      repoContentsMock.repoContentsFile('python', {
        name: 'requirements.txt',
        path: 'requirements.txt',
        content: (new Buffer(requirements, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(python);
          expect(res.body.serviceDependencies).to.have.length(1);
          expect(res.body.serviceDependencies[0]).to.equal('ElasticSearch');
          done();
        }
      );
    });
  });

  describe('Success conditions - javascript', function () {
    it('returns 0 inferred suggestions for JavaScript/NodeJS '+
       'repository with 0 dependencies', function (done) {
      var packageFile = {
        dependencies: {}
      };
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
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
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
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
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
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
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
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

    it('returns 0 inferred suggestions for JavaScript/NodeJS '+
       'repository with dependency that is a substring of matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodude': '>=5.0.0',
        }
      };
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
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

    it('returns 0 inferred suggestion for JavaScript/NodeJS '+
       'repository with no dependency property in package.json file', function (done) {
      var packageFile = {};
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
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
       'repository with multiple matching known modules', function (done) {
      var packageFile = {
        // 3 matching ElasticSearch dependencies
        dependencies: {
          'es': '0.0.0',
          'es-cli': '0.0.0',
          'esa': '0.0.0'
        }
      };
      repoContentsMock.repoContentsDirectory('nodejs', {});
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(javascript_nodejs);
          expect(res.body.serviceDependencies).to.have.length(1);
          expect(res.body.serviceDependencies[0]).to.equal('ElasticSearch');
          done();
        }
      );
    });
  });

  describe('Success conditions - ruby', function () {
    it('returns 0 inferred suggestions for Ruby/RoR '+
       'repository with 0 dependencies', function (done) {
      var Gemfile = '';
      repoContentsMock.repoContentsDirectory('ruby', {});
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (new Buffer(Gemfile, 'utf8').toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        //hooks.getErrorNoQueryParam,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 0 inferred suggestions for Ruby/RoR '+
       'repository with 0 MATCHING dependencies', function (done) {
      var filePath = __dirname + '/fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_nomatch';
      var Gemfile = fs.readFileSync(filePath);
      repoContentsMock.repoContentsDirectory('ruby', {});
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 1 inferred suggestion for Ruby/RoR '+
       'repository with 1 matching dependency', function (done) {
      var filePath = __dirname + '/fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_cassandra';
      var Gemfile = fs.readFileSync(filePath);
      repoContentsMock.repoContentsDirectory('ruby', {});
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(1);
          expect(res.body.serviceDependencies[0]).to.equal('Cassandra');
          done();
        }
      );
    });

    it('returns 3 inferred suggestions for Ruby/RoR '+
       'repository with 3 matching dependency', function (done) {
      var filePath = __dirname + '/fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_3';
      var Gemfile = fs.readFileSync(filePath);
      repoContentsMock.repoContentsDirectory('ruby', {});
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(3);
          expect(res.body.serviceDependencies[0]).to.equal('Cassandra');
          expect(res.body.serviceDependencies[1]).to.equal('ElasticSearch');
          expect(res.body.serviceDependencies[2]).to.equal('HBase');
          done();
        }
      );
    });

    it('returns 0 inferred suggestions for Ruby/RoR '+
       'repository with dependency that is a substring of matching dependency', function (done) {
      var filePath = __dirname + '/fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_substring';
      var Gemfile = fs.readFileSync(filePath);
      repoContentsMock.repoContentsDirectory('ruby', {});
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(0);
          done();
        }
      );
    });

    it('returns 1 inferred suggestion for Ruby/RoR '+
       'repository with multiple matching known modules', function (done) {
      var filePath = __dirname + '/fixtures/mocks/github/repos-contents/'+
        'gemfiles/sample_gemfile_match_multiple_cassandra';
      var Gemfile = fs.readFileSync(filePath);
      repoContentsMock.repoContentsDirectory('ruby', {});
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      });
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.be.an('object');
          expect(res.body.languageFramework).to.equal(ruby_ror);
          expect(res.body.serviceDependencies).to.have.length(1);
          expect(res.body.serviceDependencies[0]).to.equal('Cassandra');
          done();
        }
      );
    });
  });
});
