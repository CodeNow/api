var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var url = require('url');
var uuid = require('uuid');
var join = require('path').join;

var Project = require('models/mongo/projects');

describe('Projects', function () {
  beforeEach(function (done) {
    this.project = new Project();
    this.project.createDefaultEnv();
    done();
  });
  afterEach(function (done) {
    delete this.project;
    done();
  });

  it('should find the default environment', function (done) {
    expect(this.project.findDefaultEnv()).to.equal(this.project.environments[0]);
    done();
  });
});
