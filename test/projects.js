'use strict';

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
  before(extendContextSeries({
    admin: users.createAdmin,
    publisher: users.createPublisher,
    anonymous: users.createAnonymous
  }));
  after(helpers.cleanup);

  describe('creating projects', function () {
    afterEach(function (done) {
      if (!this.project) {
        return done();
      }
      var self = this;
      async.series([
        function (cb) {
          self.publisher.del(join('/contexts', self.project.environment.contexts[0].context)).expect(204).end(cb);
        },
        function (cb) {
          self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
        },
      ], function (err) {
        delete self.project;
        done(err);
      });
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
        .expectBody('owner', self.publisher._id)
        .expectBody('views', 0)
        .expectBody('votes', 0)
        .expectBody(function (body) {
          body.environment.contexts.length.should.equal(1);
          body.environment.isDefault.should.equal(true);
          body.environment.outputViews.length.should.equal(0);
          body.environments.length.should.equal(1);
          body.environments[0]._id.should.equal(body.environment._id);
          body.contexts.length.should.equal(1);
          self.project = body;
        })
        .end(done);
    });
  });

  describe('project permissions', function () {
    before(function (done) {
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
      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    after(function (done) {
      var self = this;
      async.series([
        function (cb) {
          self.publisher.del(join('/contexts', self.project.environment.contexts[0].context)).expect(204).end(cb);
        },
        function (cb) {
          self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
        },
      ], function (err) {
        delete self.project;
        done(err);
      });
    });

    it('should be visible to anonymous users', function (done) {
      this.anonymous.get('/projects/' + this.project._id).expect(200).end(done);
    });
    it('should be visible to the owner', function (done) {
      this.publisher.get('/projects/' + this.project._id).expect(200).end(done);
    });
    it('should be visible to admin users', function (done) {
      this.admin.get('/projects/' + this.project._id).expect(200).end(done);
    });

    describe('private projects', function (done) {
      before(function (done) {
        this.publisher.patch('/projects/' + this.project._id, { 'public': false }).expect(204).end(done);
      });
      before(extendContextSeries({
        otherPublisher: users.createPublisher
      }));

      it('should not be visible to anonymous users', function (done) {
        this.anonymous.get('/projects/' + this.project._id).expect(403).end(done);
      });
      it('should be visible to the owner', function (done) {
        this.publisher.get('/projects/' + this.project._id).expect(200).end(done);
      });
      it('should not be visible to other publishers', function (done) {
        this.otherPublisher.get('/projects/' + this.project._id).expect(403).end(done);
      });
      it('should be visible to admin users', function (done) {
        this.admin.get('/projects/' + this.project._id).expect(200).end(done);
      });
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
      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    afterEach(function (done) {
      var self = this;
      async.series([
        function (cb) {
          self.publisher.del(join('/contexts', self.project.environment.contexts[0].context)).expect(204).end(cb);
        },
        function (cb) {
          self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
        },
      ], function (err) {
        delete self.project;
        done(err);
      });
    });

    it('should give us details about a project as an anonymous user', function (done) {
      this.anonymous.get('/projects/' + this.project._id)
        .expect(200)
        .expectBody('name', 'new project')
        .expectBody('_id', this.project._id)
        .expectBody(function (body) {
          body.environment.contexts.length.should.equal(1);
        })
        .end(done);
    });
    it('should give us details about a project', function (done) {
      this.publisher.get('/projects/' + this.project._id)
        .expect(200)
        .expectBody('name', 'new project')
        .expectBody('_id', this.project._id)
        .expectBody(function (body) {
          body.environment.contexts.length.should.equal(1);
        })
        .end(done);
    });
  });

  describe('working with projects', function () {
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
      // for the copy
      nock('https://s3.amazonaws.com:443:443')
        .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
          '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
        .get('/runnable.context.resources.test?prefix=5358004c171f1c06f8e0319b%2Fsource%2F')
        .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ListBucketResult " +
          "xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Name>runnable.context.resources.test</Name>" +
          "<Prefix>5358004c171f1c06f8e0319b/source/</Prefix><Marker></Marker><MaxKeys>1000</MaxKeys>" +
          "<IsTruncated>false</IsTruncated></ListBucketResult>");
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable.context.resources.test\?prefix=[0-9a-f]+%2Fsource%2F/,
          '/runnable.context.resources.test?prefix=5358004c171f1c06f8e0319b%2Fsource%2F')
        .get('/runnable.context.resources.test?prefix=5358004c171f1c06f8e0319b%2Fsource%2F')
        .reply(200, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ListBucketResult xmlns=\"http://" +
          "s3.amazonaws.com/doc/2006-03-01/\"><Name>runnable.context.resources.test</Name><Prefix>" +
          "5358004c171f1c06f8e0319b/source/</Prefix><Marker></Marker><MaxKeys>1000</MaxKeys>" +
          "<IsTruncated>false</IsTruncated><Contents><Key>5358004c171f1c06f8e0319b/source/</Key>" +
          "<LastModified>2014-04-16T21:32:00.000Z</LastModified><ETag>&quot;1&quot;</ETag><Size>0" +
          "</Size><Owner><ID>2</ID><DisplayName>name</DisplayName></Owner><StorageClass>STANDARD" +
          "</StorageClass></Contents></ListBucketResult>");
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

      // make the project
      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    afterEach(function (done) {
      var self = this;
      async.series([
        function (cb) {
          self.publisher.del(join('/contexts', self.project.environment.contexts[0].context)).expect(204).end(cb);
        },
        function (cb) {
          self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
        },
      ], function (err) {
        delete self.project;
        done(err);
      });
    });

    it('should let us create a new environment', function (done) {
      this.publisher.post(join('/', 'projects/', this.project._id, 'environments'), { name: 'new environment' })
        .expect(201)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.environment.contexts.length.should.equal(1);
        })
        .end(done);
    });
    it('should let us update some properties', function (done) {
      var self = this;
      var newData = {
        name: 'brand spanking new name',
        description: 'new discription about our project',
        'public': false
      };
      this.publisher.patch('/projects/' + this.project._id, newData)
        .expect(204)
        .end(function (err) {
          if (err) {
            return done(err);
          }
          self.publisher.get(join('/', 'projects', self.project._id))
            .expect(200)
            .expectBody('name', newData.name)
            .expectBody('description', newData.description)
            .end(done);
        });
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

      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    afterEach(function (done) {
      var self = this;
      async.series([
        function (cb) {
          self.publisher.del(join('/contexts', self.project.environment.contexts[0].context)).expect(204).end(cb);
        },
        function (cb) {
          self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
        },
      ], function (err) {
        delete self.project;
        done(err);
      });
    });

    it('should be allowed for an anonymous user', function (done) {
      // TODO: this will not be allowed for private projects in the future
      this.anonymous.post(join('/projects', this.project._id, 'build'))
        .expect(200).end(done);
    });
    it('should build an image and return the contexts', function (done) {
      var self = this;
      this.publisher.post(join('/projects', this.project._id, 'build'))
        .expect(200)
        .expectBody(function (body) {
          body._id.should.equal(self.project._id);
          body.environment.contexts.length.should.equal(1);
          body.environment.isDefault.should.equal(true);
          body.contexts.length.should.equal(1);
          body.contexts[0].versions.length.should.equal(2);
        })
        .end(done);
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

      this.publisher.post('/projects', validProjectData)
        .expect(201)
        .end(function (err, res) {
          self.project = res ? res.body : undefined;
          done(err);
        });
    });
    afterEach(function (done) {
      if (!this.project) {
        return done();
      }
      var self = this;
      async.series([
        function (cb) {
          self.publisher.del(join('/contexts', self.project.environment.contexts[0].context)).expect(204).end(cb);
        },
        function (cb) {
          self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
        },
      ], function (err) {
        delete self.project;
        done(err);
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
          self.publisher.get('/projects/' + self.project._id)
            .expect(200)
            .end(done);
        });
    });
    it('should delete the project', function (done) {
      var self = this;
      var id = self.project._id;
      delete this.project;
      self.publisher.del('/projects/' + id)
        .expect(204)
        .end(function (err, res) {
          if (err) {
            return done(err);
          }
          self.publisher.get('/projects/' + id)
            .expect(404)
            .end(done);
        });
    });
  });
});
