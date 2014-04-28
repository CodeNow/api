var async = require('async');
var helpers = require('./lib/helpers');
var nock = require('nock');
var users = require('./lib/userFactory');
var url = require('url');

var Context = require('models/contexts');
var Project = require('models/projects');

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
    admin: users.createAdmin
  }));
  afterEach(helpers.cleanup);

  describe('working with context objects', function () {
    it('should not allow a resource to be uploaded to the wrong bucket', function (done) {
      var context = new Context();
      var s3Url = url.format({
        protocol: 's3:',
        slashes: true,
        host: 'runnable.context.resources.test',
        pathname: '/nottherightid/source/file.txt'
      });
      context.uploadResource(s3Url, 'content', function (err, res) {
        if (!err || (res && res.code !== 403)) {
          return done(new Error('should have returned a 403 error'));
        }
        done();
      });
    });
    it('should give us resource urls for the bucket', function () {
      var context = new Context();
      var s3Url = url.format({
        protocol: 's3:',
        slashes: true,
        host: 'runnable.context.resources.test',
        pathname: '/' + context._id.toString() + '/source/file.txt'
      });
      context.getResourceUrl('file.txt').should.equal(s3Url);
    });
  });

  describe('creating individual contexts', function () {
    beforeEach(extendContextSeries({
      nocks: function (done) {
        nock('https://s3.amazonaws.com:443')
          .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
            '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
          .filteringRequestBody(function(path) { return '*'; })
          .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
          .reply(200, "", {
            'x-amz-id-2': 'x2zYLL9sEl921uBMQUKUOrvqXHPa1CjHt7+arsYFgE7OAQ0tRuwJlHltswXut9xl',
            'x-amz-request-id': 'AD4E009CECA3A9C0',
            date: 'Wed, 23 Apr 2014 18:02:54 GMT',
            etag: '"ad3ec3801ee6ea18661bf5c61c6c72c7"',
            'content-length': '0',
            server: 'AmazonS3'
          });
        nock('https://s3.amazonaws.com:443')
          .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
            '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
          .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
          .reply(200, "", {
            'x-amz-id-2': 'e4seUs+fKRaXs3OrTnqDf+fAmUkPHtiphOwvnC5j+AObyJ+EFFargBPsM7DuLAIi',
            'x-amz-request-id': '9094B9B8316CC426',
            date: 'Wed, 23 Apr 2014 18:02:54 GMT',
            etag: '"d41d8cd98f00b204e9800998ecf8427e"',
            'content-length': '0',
            server: 'AmazonS3'
          });
        nock('https://s3.amazonaws.com:443')
          .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
            '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
          .filteringRequestBody(function(path) { return '*'; })
          .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
          .reply(200, "", {
            'x-amz-id-2': 'x2zYLL9sEl921uBMQUKUOrvqXHPa1CjHt7+arsYFgE7OAQ0tRuwJlHltswXut9xl',
            'x-amz-request-id': 'AD4E009CECA3A9C0',
            date: 'Wed, 23 Apr 2014 18:02:54 GMT',
            etag: '"ad3ec3801ee6ea18661bf5c61c6c72c7"',
            'content-length': '0',
            server: 'AmazonS3'
          });
        done();
      },
      project: function (done) {
        users.createAdmin(function (err, user) {
          user.post('/projects', validProjectData)
            .expect(201)
            .expectBody(function (body) {
              body.contexts.length.should.equal(1);
            })
            .end(function (err, res) {
              if (err) {
                return done(err);
              }
              done(err, res.body);
            });
        });
      }
    }));
    afterEach(helpers.cleanup);

    it('should error without a dockerfile', function (done) {
      this.admin.post('/contexts', {
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
      this.admin.post('/contexts', {
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
      this.admin.post('/contexts', {
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
      this.admin.post('/contexts', {
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
    beforeEach(extendContextSeries({
      nocks: function (done) {
        nock('https://s3.amazonaws.com:443')
          .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/source\//,
            '/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
          .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/source/')
          .reply(200, "", {
            'x-amz-id-2': 'e4seUs+fKRaXs3OrTnqDf+fAmUkPHtiphOwvnC5j+AObyJ+EFFargBPsM7DuLAIi',
            'x-amz-request-id': '9094B9B8316CC426',
            date: 'Wed, 23 Apr 2014 18:02:54 GMT',
            etag: '"d41d8cd98f00b204e9800998ecf8427e"',
            'content-length': '0',
            server: 'AmazonS3'
          });
        nock('https://s3.amazonaws.com:443')
          .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
            '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
          .filteringRequestBody(function(path) { return '*'; })
          .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
          .reply(200, "", {
            'x-amz-id-2': 'x2zYLL9sEl921uBMQUKUOrvqXHPa1CjHt7+arsYFgE7OAQ0tRuwJlHltswXut9xl',
            'x-amz-request-id': 'AD4E009CECA3A9C0',
            date: 'Wed, 23 Apr 2014 18:02:54 GMT',
            etag: '"ad3ec3801ee6ea18661bf5c61c6c72c7"',
            'content-length': '0',
            server: 'AmazonS3'
          });
        done();
      },
      project: function (done) {
        users.createAdmin(function (err, user) {
          user.post('/projects', validProjectData)
            .expect(201)
            .expectBody(function (body) {
              body.contexts.length.should.equal(1);
            })
            .end(function (err, res) {
              if (err) {
                return done(err);
              }
              projectId = res.body._id;
              done(err, res.body);
            });
        });
      }
    }));
    afterEach(helpers.cleanup);

    it('should give us details about a context', function (done) {
      var self = this;
      this.admin.get('/contexts/' + this.project.contexts[0].context)
        .expect(200)
        .expectBody('name', 'web-server')
        .expectBody(function (body) {
          var dockerfile = url.parse(body.dockerfile);
          dockerfile.protocol.should.equal('s3:');
          dockerfile.host.should.equal('runnable.context.resources.test');
          dockerfile.path.should.equal('/' + body._id.toString() + '/dockerfile/Dockerfile');
          body.versions.length.should.equal(1);
          body.versions[0].tag.should.equal('v0');
        })
        .end(done);
    });

    describe('adding a new context to a project', function () {
      it('should create a context on request', function (done) {
        var self = this;
        this.admin.post('/contexts', {
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
            body.versions.length.should.equal(1);
            body.versions[0].tag.should.equal('v0');
          })
          .end(done);
      });

      describe('and asking for the project again', function () {
        beforeEach(extendContextSeries({
          context: function (done) {
            users.createAdmin(function (err, user) {
              user.post('/contexts', {
                name: 'sample-name',
                dockerfile: 'FROM ubuntu\n',
                project: projectId
              }).expect(201).end(done);
            });
          }
        }));

        it('should list both contexts', function (done) {
          this.admin.get('/projects/' + projectId)
            .expect(200)
            .expectBody('name', 'new project')
            .expectBody(function (body) {
              body.contexts.length.should.equal(2);
            })
            .end(done);
        });
      });
    });
  });
});
