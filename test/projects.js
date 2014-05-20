var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var uuid = require('uuid');
var clone = require('clone');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var users = require('./fixtures/user-factory');
var projects = require('./fixtures/project-factory');

describe('Projects - /projects', function () {
  var ctx = {};

  before(api.start);
  before(dock.start);
  after(api.stop);
  after(dock.stop);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));


  describe('POST', function () {
    beforeEach(function (done) {
      nockS3();
      ctx.user = users.createRegistered(done);
    });
    afterEach(require('./fixtures/clean-ctx')(ctx));

    describe('dockerfile', function () {
      var json = {
        name: uuid(),
        contexts: [{
          name: uuid(),
          dockerfile: 'FROM ubuntu\n'
        }]
      };
      var requiredProjectKeys = Object.keys(json);

      requiredProjectKeys.forEach(function (missingBodyKey) {
        it('should error if missing '+missingBodyKey, function (done) {
          var incompleteBody = clone(json);
          delete incompleteBody[missingBodyKey];
          console.log(incompleteBody);
          ctx.user.createProject({ json: incompleteBody }, function (err) {
            expect(err).to.be.ok;
            if (err) {
              expect(err.message).to.match(new RegExp(missingBodyKey));
              expect(err.message).to.match(new RegExp('is required'));
            }
            done();
          });
        });
      });
      it('should create a project', function(done) {
        ctx.user.createProject({ json: json }, function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.equal(201);
          expect(body).to.have.property('_id');
          expect(body).to.have.property('name', json.name);
          expect(body).to.have.property('owner', ctx.user.id());
          expect(body).to.have.property('public', true);
          // contexts
          expect(body.contexts).to.be.an('array');
          expect(body.contexts[0]).to.be.an('object');
          expect(body.contexts[0]).to.have.a.property('owner', ctx.user.id());
          expect(body.contexts[0]).to.have.a.property('name', json.contexts[0].name);
          expect(body.contexts[0].dockerfile).to.match(/^s3:/);
          // environment
          expect(body.environment).to.be.an('object');
          expect(body.environment).to.have.property('_id');
          expect(body.environment).to.have.property('owner', ctx.user.id());
          done();
        });
      });
    });
  });


  // describe('GET', function () {
  //   beforeEach(function (done) {
  //     var count = createCount(done);
  //     nockS3();
  //     ctx.owner = users.createRegistered(count.inc().next);
  //     ctx.project = projects.createProjectBy(ctx.owner, count.inc().next);
  //   });
  //   afterEach(function (done) {
  //     delete ctx.project;
  //     delete ctx.user;
  //     done();
  //   });

  // });
  // describe('PATCH', function () {

  // });
  // describe('DEL', function () {

  // });
});

