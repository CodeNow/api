var Lab = require('lab');
var suite = Lab.experiment;
var test = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var async = require('async');
var url = require('url');
var join = require('path').join;

var Project = require('models/projects');

suite('Projects', function () {
  beforeEach(function (done) {
    this.project = new Project();
    this.project.createDefaultEnvironment(function (err, project) {
      this.project = project;
      done(err);
    });
  });
  afterEach(function (done) {
    delete this.project;
    done();
  });

  test('should not recreate the default environment', function (done) {
    this.project.createDefaultEnvironment(function (err) {
      if (!err) done('should have returned an error');
      else done();
    });
  });

  test('should have one default environment', function (done) {
    expect(this.project.getEnvironmentIndex()).to.equal(0);
    done();
  });

  // suite('with multiple environments', function () {
  //   beforeEach(function (done) {
  //     multiEnvProject = new Project();
  //     async.series([
  //       multiEnvProject.createDefaultEnvironment.bind(multiEnvProject),
  //       multiEnvProject.createNewEnvironment.bind(multiEnvProject, 'new environment', 'someOwnerId')
  //     ], function (err, results) {
  //       this.multiEnvProject = results.pop();
  //       done(err);
  //     });
  //   });
  //   afterEach(function (done) {
  //     delete this.multiEnvProject;
  //     done();
  //   });

  //   test('should have one default environment', function (done) {
  //     expect(this.multiEnvProject.getEnvironmentIndex()).to.equal(0);
  //     done();
  //   });

  //   test('should have the second environment', function (done) {
  //     expect(this.multiEnvProject.getEnvironmentIndex('new environment')).to.equal(0);
  //     done();
  //   });

  // });

});
