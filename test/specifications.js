var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
var extendContextSeries = helpers.extendContextSeries;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');

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
    var specData = {
      name: 'spec 1',
      description: 'description',
      instructions: 'instructions',
      requirements: ['one', 'two']
    };
    describe('publisher', function () {
      beforeEach(extendContext({
        user : users.createPublisher
      }));
      it('should create a specification', function (done) {
        this.user.specRequest(specData)
          .send()
          .expect(201)
          .end(done);
      });
      // TODO: //incorrectly responds 'already exists'
      // it('should error if missing name', function (done) {
      //   var data = _.clone(specData);
      //   delete data.name;
      //   this.user.specRequest()
      //     .send(data)
      //     .expect(400)
      //     .end(done);
      // });
      describe('already exists', function () {
        beforeEach(extendContextSeries({
          spec: ['user.specRequest', [{
            body: specData,
            expect: 201
          }]]
        }));
        it('should error if duplicate name', function (done) {
          console.log(this.user.requestStr);
          this.user.specRequest(specData)
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
        this.user.specRequest(specData)
          .send()
          .expect(201)
          .end(done);
      });
    });
  });
});