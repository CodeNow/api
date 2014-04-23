var async = require('async');
var helpers = require('./lib/helpers');
var nock = require('nock');
var users = require('./lib/userFactory');
var url = require('url');

var extendContextSeries = helpers.extendContextSeries;

var validProjectData = {
  name: 'new project',
  contexts: [{
    'name': 'web server',
    'dockerfile': 'FROM ubuntu\n' +
      'WORKDIR /root\n' +
      'RUN git clone https://github.com/heroku/node-js-sample\n' +
      'WORKDIR /root/node-js-sample\n' +
      'RUN npm install\n' +
      'ENTRYPOINT ["node"]\n' +
      'CMD ["web.js"]\n'
  }]
};

describe('Contexts', function () {
  beforeEach(extendContextSeries({
    admin: users.createAdmin
  }));
  afterEach(helpers.cleanup);

  describe('creating individual contexts', function () {
    before(extendContextSeries({
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
        done();
      }
    }));

    it('should error without all the required parameters', function (done) {
      this.admin.post('/contexts', { 'name': 'sample name' })
        .expect(400)
        .end(done);
    });
    it('should create a context on request', function (done) {
      var self = this;
      this.admin.post('/contexts', {
        'name': 'sample name',
        'dockerfile': 'FROM ubuntu\n'
      })
        .expect(201)
        .expectBody('name', 'sample name')
        .expectBody(function (body) {
          var dockerfile = url.parse(body.dockerfile);
          dockerfile.protocol.should.equal('s3:');
          dockerfile.host.should.equal('runnable.context.resources.test');
          dockerfile.path.should.equal('/' + body._id.toString() + '/dockerfile/Dockerfile');
          body.owner.should.equal(self.admin._id.toString());
        })
        .end(done);
    });
  });

  describe('getting contexts after building a project', function () {
    before(extendContextSeries({
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
          user.post('/projects', validProjectData).expect(200).end(done);
        });
      }
    }));

    it('should give us details about a context', function (done) {
      this.admin.get('/contexts/' + this.project.body.contexts[0].context)
        .expect(200)
        .expectBody('name', 'web server')
        .expectBody(function (body) {
          var dockerfile = url.parse(body.dockerfile);
          dockerfile.protocol.should.equal('s3:');
          dockerfile.host.should.equal('runnable.context.resources.test');
          dockerfile.path.should.equal('/' + body._id.toString() + '/dockerfile/Dockerfile');
        })
        .end(done);
    });
  });
});
