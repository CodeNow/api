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
var users = require('./fixtures/user-factory');

describe('Project - /projects/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('GET', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, owner, project) {
        ctx.owner = owner;
        ctx.project = project;
        done(err);
      });
    });

    describe('failures', function () {
      it('should return 400 with a bad id', function (done) {
        ctx.owner.fetchProject('fakeId', checkForError(400, done));
      });
      it('should return 404 with a non-existant id', function (done) {
        ctx.owner.fetchProject('ffffffffffffffffffffffff', checkForError(404, done));
      });
    });

    describe('public', function () {
      beforeEach(function (done) {
        ctx.project.update({ json: { public: true }}, done);
      });
      describe('owner', function () {
        it('should get the project', function (done) {
          ctx.owner.fetchProject(ctx.project.id(), function (err, body, code) {
            if (err) { return done(err); }

            expect(code).to.equal(200);
            expect(body).to.eql(ctx.project.toJSON());
            done();
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          ctx.nonOwner = users.createAnonymous(done);
        });
        it('should get the project', function (done) {
          ctx.nonOwner.fetchProject(ctx.project.id(), function (err, body) {
            if (err) { return done(err); }

            // FIXME: what fields should be returned to public?
            // expect(body).to.eql(ctx.project.toJSON());
            expect(body).to.have.property('_id', ctx.project.id());
            done();
          });
        });
      });
    });
    describe('private', function () {
      beforeEach(function (done) {
        ctx.project.update({ json: { public: false }}, done);
      });
      describe('owner', function () {
        it('should get the project', function (done) {
          ctx.owner.fetchProject(ctx.project.id(), function (err, body, code) {
            if (err) { return done(err); }

            expect(code).to.equal(200);
            expect(body).to.eql(ctx.project.toJSON());
            done();
          });
        });
      });
      describe('non-owner', function () {
        beforeEach(function (done) {
          ctx.nonOwner = users.createAnonymous(done);
        });

        it('should get forbidden', function (done) {
          ctx.nonOwner.fetchProject(ctx.project.id(), checkForError(403, done));
        });
      });
    });
  });

  describe('PATCH', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, owner, project) {
        ctx.owner = owner;
        ctx.project = project;
        done(err);
      });
    });
    describe('owner', function () {
      var updates = {
        name: uuid(),
        description: uuid(),
        public: [true, false]
      };
      Object.keys(updates).forEach(function (key) {
        var val = updates[key];
        if (Array.isArray(val)) {
          val.forEach(function (val) {
            testUpdate(key, val);
          });
        }
        else {
          testUpdate(key, val);
        }
        function testUpdate (key, val) {
          it('should update ":key"'.replace(':key', key), function (done) {
            var json = {};
            json[key] = val;
            ctx.project.update({ json: json }, function (err, body, code) {
              if (err) { return done(err); }

              expect(code).to.equal(200);
              expect(body).to.have.property(key, val);
              done();
            });
          });
        }
      });
    });
    describe('non-owner', function () {
      beforeEach(function (done) {
        ctx.nonOwner = users.createRegistered(done);
      });
      it('should repond "access denied"', function (done) {
        ctx.nonOwner.updateProject(ctx.project.id(), function (err) {
          expect(err).to.be.ok;
          expect(err.output.statusCode).to.eql(403);
          done();
        });
      });
    });
    describe('non-existant project', function () {
      beforeEach(function (done) {
        ctx.project.destroy(done);
      });
      it('should respond "not found" if the project does not exist', function(done) {
        ctx.project.update({ json: { public: true } }, checkForError(404, done));
      });
    });
  });

  describe('DEL', function () {
    beforeEach(function (done) {
      nockS3();
      multi.createRegisteredUserAndProject(function (err, owner, project) {
        ctx.owner = owner;
        ctx.project = project;
        done(err);
      });
    });

    describe('failures', function () {
      it('should return 400 with a bad id', function (done) {
        ctx.owner.fetchProject('fakeId', checkForError(400, done));
      });
      it('should return 404 with a non-existant id', function (done) {
        ctx.owner.fetchProject('ffffffffffffffffffffffff', checkForError(404, done));
      });
    });

    describe('owner', function () {
      it('should delete the project', function(done) {
        ctx.project.destroy(function (err, body, code) {
          if (err) { return done(err); }

          expect(code).to.eql(204);
          done();
        });
      });
    });
    describe('non-owner', function () {
      beforeEach(function (done) {
        ctx.nonOwner = users.createRegistered(done);
      });
      it('should repond "access denied"', function (done) {
        ctx.nonOwner.destroyProject(ctx.project.id(), checkForError(403, done));
      });
    });
    describe('non-existant project', function () {
      beforeEach(function (done) {
        ctx.project.destroy(done);
      });
      it('should respond "not found" if the project does not exist', function(done) {
        ctx.project.destroy(checkForError(404, done));
      });
    });
  });
});

function checkForError (code, done) {
  return function (err) {
    expect(err).to.be.ok;
    expect(err.output.statusCode).to.equal(code);
    done();
  };
}
