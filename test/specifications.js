var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');
var specData = function () {
  return {
    name: 'name',
    description: 'description',
    instructions: 'instructions',
    requirements: ['one', 'two']
  };
};

describe('Specifications', function () {
  describe('POST /specifications', function () {
    afterEach(helpers.cleanup);
    describe('anonymous', function () {
      beforeEach(extendContext({
        user : users.createAnonymous
      }));
      it('should error access denied', function (done) {
        this.user.specRequest()
          .expect(403)
          .end(done);
      });
    });
    describe('registered', function () {
      beforeEach(extendContext({
        user : users.createRegistered
      }));
      it('should error access denied', function (done) {
        this.user.specRequest()
          .expect(403)
          .end(done);
      });
    });
    describe('publisher', function () {
      beforeEach(extendContext({
        user : users.createPublisher
      }));
      it('should create a specification', function (done) {
        this.user.specRequest()
          .send(specData())
          .expect(201)
          .end(done);
      });
      // TODO: this is not working::
      // it('should error if missing name', function (done) {
      //   var data = _.clone(specData());
      //   delete data.name;
      //   this.user.specRequest()
      //     .send(data)
      //     .expect(400)
      //     .end(done);
      // });
      describe('already exists', function () {
        beforeEach(extendContextSeries({
          spec: ['user.post', [ '/specifications', {
            body: specData(),
            expect: 201
          }]]
        }));
        it('should error if duplicate name', function (done) {
          this.user.specRequest(specData())
            .send(specData())
            .expect(403)
            .expectBody('message', /already exists/)
            .end(done);
        });
      });
    });
    describe('admin', function () {
      beforeEach(extendContext({
        user : users.createAdmin
      }));
      it('should create a specification', function (done) {
        this.user.specRequest()
          .send(specData())
          .expect(201)
          .end(done);
      });
    });
    describe('GET /specifications/:id', function () {
      beforeEach(extendContextSeries({
        admin: users.createAdmin,
        spec: ['admin.post', [ '/specifications', {
          body: specData(),
          expect: 201
        }]],
        user: users.createAnonymous
      }));
      it('should get a specification', function (done) {
        var specId = this.spec.body._id;
        this.user.specRequest(specId)
          .expect(200)
          .end(done);
      });
      it('should 404 when not found', function (done) {
        this.user.specRequest(helpers.fakeId())
          .expect(404)
          .end(done);
      });
    });

    describe('PUT /specifications/:id', function () {
      // body...
    });

    describe('GET /specifications', function () {
      // body...
    });
  });

});