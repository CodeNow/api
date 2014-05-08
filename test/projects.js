var async = require('async');
var createCount = require('callback-count');
var helpers = require('./lib/helpers');
var join = require('path').join;
var nock = require('nock');
var users = require('./lib/userFactory');

var docklet = require('./lib/fixtures/docklet');
var docker = require('./lib/fixtures/docker');

var extendContextSeries = helpers.extendContextSeries;

var validProjectData = {
  name: 'new project',
  contexts: [{
    'name': 'web-server',
    'dockerfile': 'FROM ubuntu\n'
  }]
};

// Uncomment this line to record requests
// nock.recorder.rec();

describe('Projects', function () {
  before(function (done) {
    var count = createCount(done);
    this.docklet = docklet.start(count.inc().next);
    this.docker = docker.start(count.inc().next);
  });
  after(function (done) {
    var count = createCount(done);
    this.docklet.stop(count.inc().next);
    this.docker.stop(count.inc().next);
  });
  beforeEach(extendContextSeries({
    admin: users.createAdmin,
    publisher: users.createPublisher,
    anonymous: users.createAnonymous
  }));
  afterEach(helpers.cleanup);

  describe('creating projects', function () {
    beforeEach(function (done) { delete this.project; done(); });
    afterEach(function (done) {
      if (!this.project) {
        return done();
      }
      this.admin.del('/projects/' + this.project._id).expect(204).end(done);
    });

    it('should error when missing project parameters (name)', function (done) {
      this.publisher.post('/projects', {
        contexts: []
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.name\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error when missing project parameters (contexts)', function (done) {
      this.publisher.post('/projects', {
        name: 'new project'
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.contexts\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error when missing context parameters', function (done) {
      this.publisher.post('/projects', {
        name: 'new project',
        contexts: [{
          name: 'web-server'
        }]
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.context.dockerfile\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error when missing context parameters', function (done) {
      this.publisher.post('/projects', {
        name: 'new project',
        contexts: [{
          dockerfile: 'FROM ubuntu\n'
        }]
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.context.name\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error when given an invalid name for a context', function (done) {
      this.publisher.post('/projects', {
        name: 'new-project',
        contexts: [{
          name: 'web server',
          dockerfile: 'FROM ubuntu\n'
        }]
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.context.name\" should match/.test(body.message).should.equal(true);
        })
        .end(done);
    });

    it('should create a new project given no files', function (done) {
      // mock the request to create the source file directory (no files)
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\//g,
          '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
        .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
        .reply(200, "");
      // mock the request to create the dockerfile
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/dockerfile\/Dockerfile/g,
          '/runnable.context.resources.test/5358004b171f1c06f8e03197/dockerfile/Dockerfile')
        .filteringRequestBody(function(path) { return '*'; })
        .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/dockerfile/Dockerfile', '*')
        .reply(200, "");
      // for building the project/context
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
        .reply(200, "FROM ubuntu");

      var self = this;
      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.environments[0].contexts.length.should.equal(1);
          self.project = body;
        })
        .end(done);
    });
  });

  describe('listing projects', function () {
    beforeEach(function (done) {
      var self = this;
      // set up the nocks
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
        .reply(200, "");
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .filteringRequestBody(function(path) { return '*'; })
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
        .reply(200, "");
      // for building the project/context
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
        .reply(200, "FROM ubuntu");

      // make the project
      this.admin.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    afterEach(function (done) {
      var self = this;
      this.admin.del('/projects/' + this.project._id).expect(204).end(function (err) {
        delete self.project;
        done(err);
      });
    });

    it('should give us details about a project as an anonymous user', function (done) {
      this.anonymous.get('/projects/' + this.project._id)
        .expect(200)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.environments[0].contexts.length.should.equal(1);
        })
        .end(done);
    });
    it('should give us details about a project', function (done) {
      this.admin.get('/projects/' + this.project._id)
        .expect(200)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.environments[0].contexts.length.should.equal(1);
        })
        .end(done);
    });
  });

  describe('building projects', function () {
    beforeEach(function (done) {
      var self = this;
      // for creating the project/context
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
        .reply(200, "");
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .filteringRequestBody(function(path) { return '*'; })
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
        .reply(200, "");
      // for building the project/context
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
        .reply(200, "FROM ubuntu");
      // we are building twice now!
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
        .reply(200, "FROM ubuntu");

      this.admin.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    afterEach(function (done) {
      var self = this;
      this.admin.del('/projects/' + this.project._id).expect(204).end(function (err) {
        delete self.project;
        done(err);
      });
    });

    it('should be allowed for an anonymous user', function (done) {
      // TODO: this will not be allowed for private projects in the future
      this.anonymous.post(join('/projects', this.project._id, 'build'))
        .expect(201).end(done);
    });
    it('should build an image and return a container', function (done) {
      this.admin.post(join('/projects', this.project._id, 'build'))
        .expect(201).end(done);
    });
  });

  describe('deleting projects', function () {
    beforeEach(function (done) {
      var self = this;
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
        .reply(200, "");
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .filteringRequestBody(function(path) { return '*'; })
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
        .reply(200, "");
      // for building the project/context
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .get('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile?response-content-type=application%2Fjson')
        .reply(200, "FROM ubuntu");

      users.createAdmin(function (err, user) {
        user.post('/projects', validProjectData)
          .expect(201)
          .end(function (err, res) {
            self.project = res ? res.body : undefined;
            done(err);
          });
      });
    });
    afterEach(function (done) {
      if (!this.project) {
        return done();
      }
      var self = this;
      users.createAdmin(function (err, user) {
        user.del('/projects/' + self.project._id).expect(204).end(function (err) {
          delete self.project;
          done(err);
        });
      });
    });

    it('should not be allowed by not the owner', function (done) {
      var self = this;
      self.anonymous.del('/projects/' + self.project._id)
        .expect(403)
        .end(function (err, res) {
          if (err) {
            return done(err);
          }
          self.admin.get('/projects/' + self.project._id)
            .expect(200)
            .end(done);
        });
    });
    it('should delete the project', function (done) {
      var self = this;
      var id = self.project._id;
      delete this.project;
      self.admin.del('/projects/' + id)
        .expect(204)
        .end(function (err, res) {
          if (err) {
            return done(err);
          }
          self.admin.get('/projects/' + id)
            .expect(404)
            .end(done);
        });
    });
  });
});
