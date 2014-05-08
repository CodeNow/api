'use strict';

var helpers = require('./lib/helpers');
var extendContextSeries = helpers.extendContextSeries;
var async = require('async');
var createCount = require('callback-count');
var nock = require('nock');
var users = require('./lib/userFactory');
var join = require('path').join;

var docklet = require('./lib/fixtures/docklet');
var docker = require('./lib/fixtures/docker');

var validProjectData = {
  name: 'new project',
  contexts: [{
    'name': 'web-server',
    'dockerfile': 'FROM ubuntu\n'
  }]
};

describe('Context Files', function () {
  before(extendContextSeries({
    admin: users.createAdmin,
    publisher: users.createPublisher,
    anonymous: users.createAnonymous
  }));
  after(helpers.cleanup);
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

  beforeEach(function (done) {
    var self = this;
    // uploading files
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
        self.project = res.body;
        done(err);
      });
  });

  afterEach(function (done) {
    var self = this;
    async.series([
      function (cb) {
        self.publisher.del(join('/contexts', self.project.environments[0].contexts[0].context)).expect(204).end(cb);
      },
      function (cb) {
        self.publisher.del(join('/projects', self.project.id)).expect(204).end(cb);
      },
    ], function (err) {
      delete self.project;
      done(err);
    });
  });

  it('should let us list the files', function (done) {
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
    var id = this.project.environments[0].contexts[0].context;
    this.publisher.get(join('/contexts', id, 'files') + '?prefix=%2F')
      .expect(200)
      .expectBody(function (body) {
        body.files.Name.should.equal('runnable.context.resources.test');
        body.files.Prefix.should.equal('5358004c171f1c06f8e0319b/source/');
        body.files.Contents.length.should.equal(1);
        body.files.Contents[0].Key.should.equal('5358004c171f1c06f8e0319b/source/');
      })
      .end(done);
  });
  it('should let us list the files without a prefix', function (done) {
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
    var id = this.project.environments[0].contexts[0].context;
    this.publisher.get(join('/contexts', id, 'files'))
      .expect(200)
      .expectBody(function (body) {
        body.files.Name.should.equal('runnable.context.resources.test');
        body.files.Prefix.should.equal('5358004c171f1c06f8e0319b/source/');
        body.files.Contents.length.should.equal(1);
        body.files.Contents[0].Key.should.equal('5358004c171f1c06f8e0319b/source/');
      })
      .end(done);
  });

});
