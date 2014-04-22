var async = require('async');
var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');

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

describe('Projects', function () {
  beforeEach(extendContextSeries({
    admin: users.createAdmin
  }));
  afterEach(helpers.cleanup);

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
          'name': 'web server'
        }]
      })
        .expect(400)
        .end(done);
    });
    it('should create a new project given no files', function (done) {
      this.admin.post('/projects', validProjectData)
        .expect(200)
        .expectBody('name', 'new project')
        .expectBody(function (body) {
          body.contexts.length.should.equal(1);
        })
        .end(done);
    });
  });

  describe('listing projects', function () {
    before(extendContextSeries({
      project: function (done) {
        users.createAdmin(function (err, user) {
          user.post('/projects', validProjectData).expect(200).end(done);
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
