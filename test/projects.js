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
    it('should error when missing project parameters (name)', function (done) {
      this.admin.post('/projects', {
        contexts: []
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.name\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error when missing project parameters (contexts)', function (done) {
      this.admin.post('/projects', {
        name: 'new project'
      })
        .expect(400)
        .expectBody(function (body) {
          /\"body.contexts\" is required/.test(body.message).should.equal(true);
        })
        .end(done);
    });
    it('should error when missing context parameters', function (done) {
      this.admin.post('/projects', {
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
      this.admin.post('/projects', {
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
      this.admin.post('/projects', {
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
          .reply(200, "");
        nock('https://s3.amazonaws.com:443')
          .filteringPath(/\/runnable.context.resources.test\/[0-9a-f]+\/dockerfile\/Dockerfile/,
            '/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile')
          .filteringRequestBody(function(path) { return '*'; })
          .put('/runnable.context.resources.test/5358004c171f1c06f8e0319b/dockerfile/Dockerfile', '*')
          .reply(200, "");
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
