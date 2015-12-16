'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var async = require('async')
var api = require('../../fixtures/api-control')
var generateKey = require('../../fixtures/key-factory')
var hooks = require('../../fixtures/analyze-hooks')
var multi = require('../../fixtures/multi-factory')
var fs = require('fs')

var repoMock = require('../../fixtures/mocks/github/repo')
var repoContentsMock = require('../../fixtures/mocks/github/repos-contents')

var pythonSetupPyFile = require('../../fixtures/mocks/github/repos-contents/python-setup.py-repo-module-file')
var pythonSetupPyFileMatching =
require('../../fixtures/mocks/github/repos-contents/python-setup.py-matching-repo-module-file')

var javascriptNodeJS = 'nodejs'
var python = 'python'
var rubyRor = 'ruby_ror'
var php = 'php'

describe('Analyze - /actions/analyze', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))
  before(require('../../fixtures/mocks/api-client').setup)
  after(require('../../fixtures/mocks/api-client').clean)
  afterEach(function (done) {
    // these tests hit redis a lot, so clear out the cache when they are run.
    var redis = require('models/redis')
    redis.keys(process.env.REDIS_NAMESPACE + 'github-model-cache:*', function (err, keys) {
      if (err) { return done(err) }
      async.map(keys, function (key, cb) { redis.del(key, cb) }, done)
    })
  })
  beforeEach(generateKey)
  beforeEach(function (done) {
    multi.createUser(function (err, user) {
      if (err) { return done(err) }
      ctx.user = user
      ctx.request = user.client.request
      done()
    })
  })
  afterEach(require('../../fixtures/clean-ctx')(ctx))

  describe('Error conditions', function () {
    it('should return 400 code without a "repo" query parameter', function (done) {
      ctx.request.get(
        hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(400)
          expect(res.body.message).to.equal('query parameter "repo" must be a string')
          done()
        })
    })

    it('should return 400 code for repository with no recognized dependency file', function (done) {
      repoContentsMock.repoContentsDirectory('python', {})
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(400)
          expect(res.body.message).to.equal('unknown language/framework type')
          done()
        })
    })
  })

  /**
   * Testing backup method of language/dependency inferrence using GitHub Repo API
   * Backup method used when no dependency file detected in project. We can infer language
   * but no dependencies
   */
  describe('Success conditions - unknown', function () {
    it('should successfully identify language as JavaScript w/ no package.json present & GitHub API indicates JavaScript', function (done) {
      repoContentsMock.repoContentsDirectory('unknown', {})
      repoMock.standardRepo({language: 'JavaScript'})
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('should successfully identify language as Python w/ no requirements.txt present & GitHub API indicates Python', function (done) {
      repoContentsMock.repoContentsDirectory('unknown', {})
      repoMock.standardRepo({language: 'Python'})
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(python)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('should successfully identify language as Ruby w/ no Gemfile present & GitHub API indicates Ruby', function (done) {
      repoContentsMock.repoContentsDirectory('unknown', {})
      repoMock.standardRepo({language: 'Ruby'})
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })
  })

  /**
   * Python
   * -------------------------------------------------
   */
  describe('Success conditions - python', function () {
    describe('matching against requirements.txt', function () {
      it('returns 0 inferred suggestions for python repository with 0 dependencies', function (done) {
        var requirements = ''
        repoContentsMock.repoContentsDirectory('python', {})
        repoContentsMock.repoContentsFile('python', {
          name: 'requirements.txt',
          path: 'requirements.txt',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(0)
            done()
          }
        )
      })

      it('returns 0 inferred suggestions for python repository with 0 MATCHING dependencies', function (done) {
        var requirements = 'Django==1.3\n' +
          'stripe\n' +
          'py-bcrypt'
        repoContentsMock.repoContentsDirectory('python', {})
        repoContentsMock.repoContentsFile('python', {
          name: 'requirements.txt',
          path: 'requirements.txt',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(0)
            done()
          }
        )
      })

      it('returns 1 inferred suggestions for python repository with 1 matching dependency', function (done) {
        var requirements = 'Django==1.3\n' +
          'stripe\n' +
          'Eve-Elastic\n' + // matching dependency
          'py-bcrypt'
        repoContentsMock.repoContentsDirectory('python', {})
        repoContentsMock.repoContentsFile('python', {
          name: 'requirements.txt',
          path: 'requirements.txt',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(1)
            expect(res.body.serviceDependencies[0]).to.equal('elasticsearch')
            done()
          }
        )
      })

      it('returns 3 inferred suggestions for python repository with 3 matching dependency', function (done) {
        var requirements = 'Django==1.3\n' +
          'stripe\n' +
          'Eve-Elastic==0.10.0\n' + // matching dependency (ElasticSearch)
          'fooddep\n' +
          'casscache\n' + // matching (memcached)
          'Djamo\n' + // matching (mongodb)
          'py-bcrypt'
        repoContentsMock.repoContentsDirectory('python', {})
        repoContentsMock.repoContentsFile('python', {
          name: 'requirements.txt',
          path: 'requirements.txt',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(3)
            expect(res.body.serviceDependencies[0]).to.equal('elasticsearch')
            expect(res.body.serviceDependencies[1]).to.equal('memcached')
            expect(res.body.serviceDependencies[2]).to.equal('mongodb')
            done()
          }
        )
      })

      it('returns 0 inferred suggestions for python repository with dependency that is a substring of matching dependency', function (done) {
        var requirements = 'Django==1.3\n' +
          'stripe\n' +
          'Eve-Ela==0.10.0\n' + // matching dependency SUBSTRING (ElasticSearch)
          'fooddep\n' +
          'cassc\n' + // matching SUBSTRING (memcached)
          'Dj\n' + // matching SUBSTRING (mongodb)
          'py-bcrypt'
        repoContentsMock.repoContentsDirectory('python', {})
        repoContentsMock.repoContentsFile('python', {
          name: 'requirements.txt',
          path: 'requirements.txt',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(0)
            done()
          }
        )
      })

      it('returns 1 inferred suggestions for python repository with multiple matching known modules', function (done) {
        // 3 matching known dependencies
        var requirements = 'elasticstack\n' +
          'elasticsearch\n' +
          'elong'
        repoContentsMock.repoContentsDirectory('python', {})
        repoContentsMock.repoContentsFile('python', {
          name: 'requirements.txt',
          path: 'requirements.txt',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(1)
            expect(res.body.serviceDependencies[0]).to.equal('elasticsearch')
            done()
          }
        )
      })
    })

    describe('matching against setup.py', function () {
      it('returns 0 inferred suggestions for python repository with 0 dependencies', function (done) {
        var requirements = ''
        repoContentsMock.repoContentsDirectory('python-setup.py', {})
        repoContentsMock.repoContentsFile('python-setup.py', {
          name: 'setup.py',
          path: 'setup.py',
          content: (new Buffer(requirements, 'utf8').toString('base64'))
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(0)
            done()
          }
        )
      })

      it('returns 0 inferred suggestions for python repository with 0 MATCHING dependencies', function (done) {
        repoContentsMock.repoContentsDirectory('python-setup.py', {})
        repoContentsMock.repoContentsFile('python-setup.py', {
          name: 'setup.py',
          path: 'setup.py',
          content: pythonSetupPyFile.content
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(0)
            done()
          }
        )
      })

      it('returns 2 inferred suggestions for python repository with 2 matching dependency', function (done) {
        repoContentsMock.repoContentsDirectory('python-setup.py', {})
        repoContentsMock.repoContentsFile('python-setup.py', {
          name: 'setup.py',
          path: 'setup.py',
          content: pythonSetupPyFileMatching.content
        })
        ctx.request.get(
          hooks.getSuccess,
          // hooks.getErrorNoQueryParam,
          function (err, res) {
            if (err) { return done(err) }
            expect(res.statusCode).to.equal(200)
            expect(res.body).to.be.an.object()
            expect(res.body.languageFramework).to.equal(python)
            expect(res.body.serviceDependencies).to.have.length(2)
            expect(res.body.serviceDependencies[0]).to.equal('postgresql')
            expect(res.body.serviceDependencies[1]).to.equal('redis')
            done()
          }
        )
      })
    })
  })

  /**
   * JavaScript
   * -------------------------------------------------
   */
  describe('Success conditions - javascript', function () {
    it('returns 0 inferred suggestions for JavaScript/NodeJS repository with 0 dependencies', function (done) {
      var packageFile = {
        dependencies: {}
      }
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8')).toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 0 inferred suggestions for JavaScript/NodeJS repository with 0 matching dependencies and X non-matching dependencies', function (done) {
      var packageFile = {
        dependencies: {
          '101': '>=5.0.0',
          'dat-middlware': '0.0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8')).toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 1 inferred suggestion for JavaScript/NodeJS repository with 1 matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodb': '>=5.0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8')).toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(1)
          done()
        }
      )
    })

    it('returns 3 inferred suggestions for JavaScript/NodeJS repository with 3 matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodb': '>=5.0.0',
          'redis': '>=5.0.0',
          'mysql': '>=5.0.0',
          'somethingfake': '0.0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8')).toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(3)
          done()
        }
      )
    })

    it('returns 0 inferred suggestions for JavaScript/NodeJS repository with dependency that is a substring of matching dependency', function (done) {
      var packageFile = {
        dependencies: {
          'mongodude': '>=5.0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8')).toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 0 inferred suggestion for JavaScript/NodeJS repository with no dependency property in package.json file', function (done) {
      var packageFile = {}
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8')).toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 1 inferred suggestion for JavaScript/NodeJS repository with multiple matching known modules', function (done) {
      var packageFile = {
        // 3 matching ElasticSearch dependencies
        dependencies: {
          'es': '0.0.0',
          'es-cli': '0.0.0',
          'esa': '0.0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('nodejs', {})
      repoContentsMock.repoContentsFile('nodejs', {
        name: 'package.json',
        path: 'package.json',
        content: (new Buffer(JSON.stringify(packageFile), 'utf8').toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(javascriptNodeJS)
          expect(res.body.serviceDependencies).to.have.length(1)
          expect(res.body.serviceDependencies[0]).to.equal('elasticsearch')
          done()
        }
      )
    })
  })

  /**
   * Ruby
   * -------------------------------------------------
   */
  describe('Success conditions - ruby', function () {
    it('returns 0 inferred suggestions for Ruby/RoR repository with 0 dependencies', function (done) {
      var Gemfile = ''
      repoContentsMock.repoContentsDirectory('ruby', {})
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (new Buffer(Gemfile, 'utf8').toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 0 inferred suggestions for Ruby/RoR repository with 0 MATCHING dependencies', function (done) {
      var filePath = __dirname + '/../../fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_nomatch'
      var Gemfile = fs.readFileSync(filePath)
      repoContentsMock.repoContentsDirectory('ruby', {})
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 1 inferred suggestion for Ruby/RoR repository with 1 matching dependency', function (done) {
      var filePath = __dirname + '/../../fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_cassandra'
      var Gemfile = fs.readFileSync(filePath)
      repoContentsMock.repoContentsDirectory('ruby', {})
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(1)
          expect(res.body.serviceDependencies[0]).to.equal('cassandra')
          done()
        }
      )
    })

    it('returns 3 inferred suggestions for Ruby/RoR repository with 3 matching dependency', function (done) {
      var filePath = __dirname + '/../../fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_3'
      var Gemfile = fs.readFileSync(filePath)
      repoContentsMock.repoContentsDirectory('ruby', {})
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(3)
          expect(res.body.serviceDependencies[0]).to.equal('cassandra')
          expect(res.body.serviceDependencies[1]).to.equal('elasticsearch')
          expect(res.body.serviceDependencies[2]).to.equal('hbase')
          done()
        }
      )
    })

    it('returns 0 inferred suggestions for Ruby/RoR repository with dependency that is a substring of matching dependency', function (done) {
      var filePath = __dirname + '/../../fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_substring'
      var Gemfile = fs.readFileSync(filePath)
      repoContentsMock.repoContentsDirectory('ruby', {})
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 1 inferred suggestion for Ruby/RoR repository with multiple matching known modules', function (done) {
      var filePath = __dirname + '/../../fixtures/mocks/github/repos-contents/gemfiles/sample_gemfile_match_multiple_cassandra'
      var Gemfile = fs.readFileSync(filePath)
      repoContentsMock.repoContentsDirectory('ruby', {})
      repoContentsMock.repoContentsFile('ruby', {
        name: 'Gemfile',
        path: 'Gemfile',
        content: (Gemfile.toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(rubyRor)
          expect(res.body.serviceDependencies).to.have.length(1)
          expect(res.body.serviceDependencies[0]).to.equal('cassandra')
          done()
        }
      )
    })
  })

  /**
   * PHP
   * -------------------------------------------------
   */
  describe('Success conditions - PHP', function () {
    it('returns 0 inferred suggestions for php repository with 0 dependencies', function (done) {
      var composerFile = {
        require: {}
      }
      repoContentsMock.repoContentsDirectory('php', {})
      repoContentsMock.repoContentsFile('php', {
        name: 'composer.json',
        path: 'composer.json',
        content: (new Buffer(JSON.stringify(composerFile), 'utf8').toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(php)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 0 inferred suggestions for php repository with 0 MATCHING dependencies', function (done) {
      var composerFile = {
        require: {
          'some-module1': '0.0',
          'some-other-module': '0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('php', {})
      repoContentsMock.repoContentsFile('php', {
        name: 'composer.json',
        path: 'composer.json',
        content: new Buffer(JSON.stringify(composerFile), 'utf8').toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(php)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 1 inferred suggestions for php repository with 1 matching dependency', function (done) {
      var composerFile = {
        require: {
          'some-module1': '1.2.0',
          'some-other-module': '1.2.0',
          'simplon/redis': '13.9'
        }
      }
      repoContentsMock.repoContentsDirectory('php', {})
      repoContentsMock.repoContentsFile('php', {
        name: 'composer.json',
        path: 'composer.json',
        content: new Buffer(JSON.stringify(composerFile), 'utf8').toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(php)
          expect(res.body.serviceDependencies).to.have.length(1)
          expect(res.body.serviceDependencies).to.contain('redis')
          done()
        }
      )
    })

    it('returns 3 inferred suggestions for php repository with 3 matching dependency', function (done) {
      var composerFile = {
        require: {
          'some-module1': '0.0',
          'some-other-module': '0.0',
          'simplon/redis': '0.0', // redis
          'aequasi/cache-bundle': '0.0', // memcached
          'brightflair/php.gt': '0.0' // mysql
        }
      }
      repoContentsMock.repoContentsDirectory('php', {})
      repoContentsMock.repoContentsFile('php', {
        name: 'composer.json',
        path: 'composer.json',
        content: new Buffer(JSON.stringify(composerFile), 'utf8').toString('base64')
      })
      ctx.request.get(
        hooks.getSuccess,
        // hooks.getErrorNoQueryParam,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(php)
          expect(res.body.serviceDependencies).to.have.length(3)
          expect(res.body.serviceDependencies).to.contain('redis')
          expect(res.body.serviceDependencies).to.contain('memcached')
          expect(res.body.serviceDependencies).to.contain('mysql')
          done()
        }
      )
    })

    it('returns 0 inferred suggestions for php repository with dependency that is a substring of matching dependency', function (done) {
      var composerFile = {
        require: {
          'some-module1': '0',
          'some-other-module': '0',
          'brightflair/ph': '0' // <-- substring
        }
      }
      repoContentsMock.repoContentsDirectory('php', {})
      repoContentsMock.repoContentsFile('php', {
        name: 'composer.json',
        path: 'composer.json',
        content: (new Buffer(JSON.stringify(composerFile), 'utf8').toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(php)
          expect(res.body.serviceDependencies).to.have.length(0)
          done()
        }
      )
    })

    it('returns 1 inferred suggestions for php repository with multiple matching known modules', function (done) {
      // 3 mysql dependencies
      var composerFile = {
        require: {
          'azema/phigrate': '0.0',
          'aol/transformers': '0.0',
          'andyfleming/handy': '0.0'
        }
      }
      repoContentsMock.repoContentsDirectory('php', {})
      repoContentsMock.repoContentsFile('php', {
        name: 'composer.json',
        path: 'composer.json',
        content: (new Buffer(JSON.stringify(composerFile), 'utf8').toString('base64'))
      })
      ctx.request.get(
        hooks.getSuccess,
        function (err, res) {
          if (err) { return done(err) }
          expect(res.statusCode).to.equal(200)
          expect(res.body).to.be.an.object()
          expect(res.body.languageFramework).to.equal(php)
          expect(res.body.serviceDependencies).to.have.length(1)
          expect(res.body.serviceDependencies).to.contain('mysql')
          done()
        }
      )
    })
  })
})
