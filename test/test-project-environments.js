var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var users = require('./fixtures/user-factory');

describe('Environments - /project/:id/environments', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, owner, project) {
        ctx.owner = owner;
        ctx.project = project;
        done(err);
      });
    });

    it('should create an environment for a project', function (done) {
      ctx.project.createEnvironment(function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body.contexts).to.be.an('array');
        expect(body.contexts).to.have.a.lengthOf(1);
        done();
      });
    });
    // describe('non-existant project', function() {
    //   beforeEach(function (done) {
    //     ctx.projectId =
    //     ctx.project.destroy(done);
    //   });
    //   it('should respond "not found"', function (done) {

    //   });
    // });
  });

  // describe('GET', function () {
  //   beforeEach(function (done) {
  //     nockS3();
  //     multi.createRegisteredUserAndProject(function (err, owner, project) {
  //       ctx.owner = owner;
  //       ctx.project = project;
  //       done(err);
  //     });
  //   });

  // });


  // describe('PATCH', function () {
  //   beforeEach(function (done) {
  //     nockS3();
  //     multi.createRegisteredUserAndProject(function (err, owner, project) {
  //       ctx.owner = owner;
  //       ctx.project = project;
  //       done(err);
  //     });
  //   });

  // });


  // describe('DEL', function () {

  // });
});