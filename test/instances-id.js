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
var expects = require('./fixtures/expects');

describe('Instance - /instances/:id', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  beforeEach(require('./fixtures/nock-github'));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    nockS3();
    multi.createInstance(function (err, instance, build, env, project, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.user = user;
      done();
    });
  });
  describe('GET', function () {
    describe('permissions', function() {
      describe('public', function() {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: true } }, done);
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expectSuccess(done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            ctx.nonOwner = multi.createUser(done);
          });
          it('should get the instance', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expectSuccess(done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(), expectSuccess(done));
          });
        });
      });
      describe('private', function() {
        beforeEach(function (done) {
          ctx.instance.update({ json: { public: false } }, done);
        });
        describe('owner', function () {
          it('should get the instance', function (done) {
            ctx.instance.fetch(expectSuccess(done));
          });
        });
        describe('non-owner', function () {
          beforeEach(function (done) {
            require('nock').cleanAll();
            require('./fixtures/mocks/github/user-orgs')(ctx.user);
            ctx.nonOwner = multi.createUser(done);
          });
          it('should not get the instance (403 forbidden)', function (done) {
            ctx.nonOwner.fetchInstance(ctx.instance.id(), expects.errorStatus(403, done));
          });
        });
        describe('moderator', function () {
          beforeEach(function (done) {
            ctx.moderator = multi.createModerator(done);
          });
          it('should get the instance', function (done) {
            ctx.moderator.fetchInstance(ctx.instance.id(),expectSuccess(done));
          });
        });
      });
    });
    // ['instance'].forEach(function (destroyName) {
    //   describe('not founds', function() {
    //     beforeEach(function (done) {
    //       ctx[destroyName].destroy(done);
    //     });
    //     it('should not get the instance if missing (404 '+destroyName+')', function (done) {
    //       ctx.instance.fetch(expects.errorStatus(404, done));
    //     });
    //   });
    // });
    function expectSuccess (done) {
      return function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.be.ok;
        expect(body.channels).to.be.ok;
        expect(body.containers).to.be.ok;
        expect(body.created).to.be.ok;
        expect(body.createdBy).to.be.ok;
        expect(body.environment).to.be.ok;
        expect(body.name).to.be.ok;
        expect(body.outputViews).to.be.ok;
        expect(body.owner).to.be.ok;
        expect(body.project).to.be.ok;
        expect(body).to.eql(ctx.instance.toJSON());
        done();
      };
    }
  });

  // describe('PATCH', function () {
  //   var updates = [{
  //     name: uuid()
  //   }, {
  //     public: true,
  //   }, {
  //     public: false
  //   }];

  //   describe('permissions', function() {
  //     describe('owner', function () {
  //       updates.forEach(function (json) {
  //         var keys = Object.keys(json);
  //         var vals = keys.map(function (key) { return json[key]; });
  //         it('should update instance\'s '+keys+' to '+vals, function (done) {
  //           ctx.instance.update({ json: json }, expects.updateSuccess(json, done));
  //         });
  //       });
  //     });
  //     describe('non-owner', function () {
  //       beforeEach(function (done) {
  //         ctx.nonOwner = multi.createUser(done);
  //       });
  //       updates.forEach(function (json) {
  //         var keys = Object.keys(json);
  //         var vals = keys.map(function (key) { return json[key]; });
  //         it('should not update instance\'s '+keys+' to '+vals+' (403 forbidden)', function (done) {
  //           ctx.instance.client = ctx.nonOwner.client; // swap auth to nonOwner's
  //           ctx.instance.update({ json: json }, expects.errorStatus(403, done));
  //         });
  //       });
  //     });
  //     describe('moderator', function () {
  //       beforeEach(function (done) {
  //         ctx.moderator = multi.createModerator(done);
  //       });
  //       updates.forEach(function (json) {
  //         var keys = Object.keys(json);
  //         var vals = keys.map(function (key) { return json[key]; });
  //         it('should update instance\'s '+keys+' to '+vals, function (done) {
  //           ctx.instance.client = ctx.moderator.client; // swap auth to moderator's
  //           ctx.instance.update({ json: json }, expects.updateSuccess(json, done));
  //         });
  //       });
  //     });
  //   });
  //   ['instance'].forEach(function (destroyName) {
  //     describe('not founds', function() {
  //       beforeEach(function (done) {
  //         ctx[destroyName].destroy(done);
  //       });
  //       updates.forEach(function (json) {
  //         var keys = Object.keys(json);
  //         var vals = keys.map(function (key) { return json[key]; });
  //         it('should not update instance\'s '+keys+' to '+vals+' (404 not found)', function (done) {
  //           ctx.instance.update({ json: json }, expects.errorStatus(404, done));
  //         });
  //       });
  //     });
  //   });
  // });

  // describe('DELETE', function () {
  //   describe('permissions', function() {
  //     describe('owner', function () {
  //       it('should delete the instance', function (done) {
  //         ctx.instance.destroy(expects.success(204, done));
  //       });
  //     });
  //     describe('non-owner', function () {
  //       beforeEach(function (done) {
  //         ctx.nonOwner = multi.createUser(done);
  //       });
  //       it('should not delete the instance (403 forbidden)', function (done) {
  //         ctx.instance.client = ctx.nonOwner.client; // swap auth to nonOwner's
  //         ctx.instance.destroy(expects.errorStatus(403, done));
  //       });
  //     });
  //     describe('moderator', function () {
  //       beforeEach(function (done) {
  //         ctx.moderator = multi.createModerator(done);
  //       });
  //       it('should delete the instance', function (done) {
  //         ctx.instance.client = ctx.moderator.client; // swap auth to moderator's
  //         ctx.instance.destroy(expects.success(204, done));
  //       });
  //     });
  //   });
  //   ['instance'].forEach(function (destroyName) {
  //     describe('not founds', function() {
  //       beforeEach(function (done) {
  //         ctx[destroyName].destroy(done);
  //       });
  //       it('should not delete the instance if missing (404 '+destroyName+')', function (done) {
  //         ctx.instance.destroy(expects.errorStatus(404, done));
  //       });
  //     });
  //   });
  // });
});
