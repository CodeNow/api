var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var User = require('models/mongo/user');
var Project = require('models/mongo/project');

describe('Projects', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  beforeEach(function (done) {
    this.user = new User();
    this.user.save(done);
  });
  afterEach(function (done) {
    delete this.user;
    delete this.project;
    done();
  });

  it('should be able to save a project!', function (done) {
    this.project = new Project({
      name: 'name',
      description: 'description',
      public: false,
      owner: this.user._id
    });
    this.project.save(function (err, project) {
      if (err) { done(err); }
      else {
        expect(project).to.be.okay;
        done();
      }
    });
  });
});
