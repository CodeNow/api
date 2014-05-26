var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var uuid = require('uuid');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

describe('Environments - /projects/:id/environments', function () {
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
      multi.createRegisteredUserAndProject(function (err, user, project) {
        if (err) { return done(err); }
        ctx.user = user;
        ctx.project = project;
        done();
      });
    });

    it('should create an environment for a project', function (done) {
      var newName = uuid();
      ctx.project.createEnvironment({ json: { name: newName }}, function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(201);
        expect(body).to.have.property('_id');
        expect(body).to.have.property('owner', ctx.user.id());
        expect(body.contexts).to.be.an('array');
        expect(body.contexts).to.have.length(1);
        expect(body.contexts[0].context).to.be.ok;
        expect(body.contexts[0].version).to.be.ok;
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

  describe('GET', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, user, project) {
        ctx.user = user;
        ctx.project = project;
        done(err);
      });
    });

    it('should return the list of environments for a project', function (done) {
      ctx.project.fetchEnvironments(function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.be.an('array');
        expect(body[0]).to.have.property('owner', ctx.user.id());
        expect(body[0].contexts).to.be.an('array');
        expect(body[0].contexts).to.have.length(1);
        expect(body[0].contexts[0].context).to.be.ok;
        expect(body[0].contexts[0].version).to.be.ok;
        done();
      });
    });
  });
});
