var async = require('async');
var helpers = require('./lib/helpers');
var nock = require('nock');
var users = require('./lib/userFactory');


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

// Uncomment this line to record requests
// nock.recorder.rec();

describe('Projects', function () {
  beforeEach(extendContextSeries({
    admin: users.createAdmin
  }));
  afterEach(helpers.cleanup);
  // Uncomment this block to print out recorded requests
  // after(function (done) {
  //   var calls = nock.recorder.play();
  //   if (!Array.isArray(calls)) calls = [calls];
  //   calls.forEach(console.log.bind(console));
  //   done();
  // });

  describe('creating projects', function () {
    it('should error when missing project parameters', function (done) {
      this.admin.post('/projects', {
        name: 'new project'
      })
        .expect(400)
        .end(done);
    });
    it('should error when missing context parameters', function (done) {
      this.admin.post('/projects', {
        name: 'new project',
        contexts: [{
          'name': 'web-server'
        }]
      })
        .expect(400)
        .end(done);
    });
    it('should create a new project given no files', function (done) {
      // mock the request to create the source file directory (no files)
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/source\//g,
          '/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
        .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/source/')
        .reply(200, "", {
          'x-amz-id-2': 'S9p+tIcDKWA78EfCFH9iWwhT3qIVlXu1HsD4jbX3jWVYsSncjke0rcXP6ILsewvO',
          'x-amz-request-id': '90BD559499D6DE1D',
          date: new Date(),
          etag: '"d41d8cd98f00b204e9800998ecf8427e"',
          'content-length': '0',
          server: 'AmazonS3'
        });
      // mock the request to create the dockerfile
      nock('https://s3.amazonaws.com:443')
        .filteringPath(/\/runnable\.context\.resources\.test\/[0-9a-f]+\/dockerfile\/Dockerfile/g,
          '/runnable.context.resources.test/5358004b171f1c06f8e03197/dockerfile/Dockerfile')
        .filteringRequestBody(function(path) { return '*'; })
        .put('/runnable.context.resources.test/5358004b171f1c06f8e03197/dockerfile/Dockerfile', '*')
        .reply(200, "", {
          'x-amz-id-2': 'gv5hLgKHFFptOKSKjG7Uf5TS2JaPzHmGauNqJmPei4CWr4osk5lXdNzYNFlZYPqM',
          'x-amz-request-id': '014DD6C022BAEBC4',
          date: new Date(),
          etag: '"ad3ec3801ee6ea18661bf5c61c6c72c7"',
          'content-length': '0',
          server: 'AmazonS3'
        });

      this.admin.post('/projects', validProjectData)
        .expect(201)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.contexts.length.should.equal(1);
        })
        .end(done);
    });
  });

  describe('listing projects', function () {
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
          user.post('/projects', validProjectData).expect(201).end(done);
        });
      }
    }));

    it('should give us details about a project', function (done) {
      this.admin.get('/projects/' + this.project.body._id)
        .expect(200)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.contexts.length.should.equal(1);
        })
        .end(done);
    });
  });
});
