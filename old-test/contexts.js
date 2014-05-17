'use strict';

var async = require('async');
var createCount = require('callback-count');
var helpers = require('./lib/helpers');
var nock = require('nock');
var users = require('./lib/userFactory');
var url = require('url');
var join = require('path').join;

var Context = require('models/contexts');
var Project = require('models/projects');

var docklet = require('./lib/fixtures/docklet');
var docker = require('./lib/fixtures/docker');

var extendContextSeries = helpers.extendContextSeries;

var validProjectData = {
  name: 'new project',
  contexts: [{
    'name': 'web-server',
    'dockerfile': 'FROM ubuntu\n' +
      'WORKDIR /root\n' +
      'RUN git clone https://github.com/heroku/node-js-sample\n' +
      'WORKDIR /root/node-js-sample\n' +
      'RUN npm install\n' +
      'ENTRYPOINT ["node"]\n' +
      'CMD ["web.js"]\n'
  }]
};
var projectId;

describe('Contexts', function () {
  beforeEach(extendContextSeries({
    admin: users.createAdmin,
    publisher: users.createPublisher,
    anonymous: users.createAnonymous
  }));
  afterEach(helpers.cleanup);
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

  describe('creating individual contexts', function () {
    beforeEach(function (done) {
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .filteringRequestBody(function(path) { return '*'; })
        .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
        .reply(200, "");
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

      var self = this;
      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .expectBody(function (body) {
          body.environments.length.should.equal(1);
          body.environment.contexts.length.should.equal(1);
          body.environment.isDefault.should.equal(true);
          body.environment.owner.should.equal(body.owner);
          self.project = body;
        })
        .end(done);
    });
    afterEach(helpers.cleanup);

    it('should error without a dockerfile', function (done) {
      this.admin.post(join('/', 'projects', this.project._id, 'contexts'), {
        name: 'sample-name',
        project: this.project._id
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.dockerfile\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error without a project', function (done) {
      this.admin.post(join('/', 'projects', this.project._id, 'contexts'), {
        name: 'sample-name',
        dockerfile: 'FROM ubuntu\n'
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.project\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error with an invalid name (invalid chars)', function (done) {
      this.admin.post(join('/', 'projects', this.project._id, 'contexts'), {
        name: 'sample name',
        project: this.project._id,
        dockerfile: 'FROM ubuntu\n'
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.name\" should match/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error with an invalid name (invalid chars)', function (done) {
      this.admin.post(join('/', 'projects', this.project._id, 'contexts'), {
        name: '#$%^&',
        project: this.project._id,
        dockerfile: 'FROM ubuntu\n'
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.name\" should match/.test(body.message).should.equal(true);
        })
        .end(done);
    });
  });

  describe('after building a project with a context', function () {
    beforeEach(function (done) {
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

      var self = this;
      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .expectBody(function (body) {
          body.environments.length.should.equal(1);
          body.environment.contexts[0].context.should.not.equal(undefined);
        })
        .end(function (err, res) {
          if (err) {
            return done(err);
          }
          self.project = res.body;
          projectId = res.body._id;
          done(err);
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

    it('should give us details about a context', function (done) {
      var self = this;
      this.admin.get('/contexts/' + this.project.environment.contexts[0].context)
        .expect(200)
        .expectBody('name', 'web-server')
        .expectBody(function (body) {
          var dockerfile = url.parse(body.dockerfile);
          dockerfile.protocol.should.equal('s3:');
          dockerfile.host.should.equal('runnable.context.resources.test');
          dockerfile.path.should.equal('/' + body._id.toString() + '/dockerfile/Dockerfile');
          body.versions.length.should.equal(1);
          body.versions[0]._id.should.not.equal(undefined);
        })
        .end(done);
    });

    describe('adding a new context to a project', function () {
      it('should create a context on request', function (done) {
        var self = this;
        this.admin.post(join('/', 'projects', this.project._id, 'contexts'), {
          name: 'sample-name',
          dockerfile: 'FROM ubuntu\n',
          project: this.project._id
        })
          .expect(201)
          .expectBody('name', 'sample-name')
          .expectBody(function (body) {
            var dockerfile = url.parse(body.dockerfile);
            dockerfile.protocol.should.equal('s3:');
            dockerfile.host.should.equal('runnable.context.resources.test');
            dockerfile.path.should.equal('/' + body._id.toString() + '/dockerfile/Dockerfile');
            body.owner.should.equal(self.admin._id.toString());
            body.versions.length.should.equal(0);
          })
          .end(done);
      });

      describe('and asking for the project again', function () {
        beforeEach(function (done) {
          this.admin.post(join('/', 'projects', this.project._id, 'contexts'), {
            name: 'sample-name',
            dockerfile: 'FROM ubuntu\n',
            project: this.project._id
          }).expect(201).end(done);
        });

        it('should list both contexts', function (done) {
          this.admin.get('/projects/' + this.project._id)
            .expect(200)
            .expectBody('name', 'new project')
            .expectBody(function (body) {
              body.environment.contexts.length.should.equal(2);
            })
            .end(done);
        });
      });
    });
  });

  describe('deleting contexts', function () {
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
      self.anonymous.del('/contexts/' + self.project.environment.contexts[0].context)
        .expect(403)
        .end(function (err, res) {
          if (err) {
            return done(err);
          }
          self.admin.get('/contexts/' + self.project.environment.contexts[0].context)
            .expect(200)
            .end(done);
        });
    });
    it('should delete the context', function (done) {
      var self = this;
      var id = self.project.environment.contexts[0].context;
      delete this.project;
      self.admin.del('/contexts/' + id)
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
