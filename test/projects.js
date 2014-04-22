var async = require('async');
var helpers = require('./lib/helpers');
var users = require('./lib/userFactory');

var extendContextSeries = helpers.extendContextSeries;

describe('Projects', function () {
  before(extendContextSeries({
    admin: users.createAdmin
  }));
  after(helpers.cleanup);

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
      this.admin.post('/projects', {
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
      })
        .expect(201)
        .end(function (err, res) {
          console.log(res.body);
          done(err);
        });
    });
  });
});
