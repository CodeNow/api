var users = require('./lib/userFactory');
var categories = require('./lib/categoriesFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;

describe('Categories', function () {

  afterEach(helpers.cleanup);

  describe('GET /categories', function () {
    beforeEach(extendContext({
      user : users.createAnonymous,
      categories : categories.createCategories('facebook', 'jquery')
    }));
    it('should respond with an array', function (done) {
      this.user.specRequest()
        .expect(200)
        .expectArray(2)
        .end(done);
    });
  });

  describe('POST /categories', function () {
    describe('admin', function () {
      beforeEach(extendContext({
        user : users.createAdmin
      }));
      it('should respond 201', function (done) {
        this.user.specRequest()
          .send({ name: 'newCategory', description: 'description' })
          .expect(201)
          .expectBody('_id')
          .expectBody('description', 'description')
          .end(done);
      });
      it('should respond 400 if not given a name', function (done) {
        this.user.specRequest()
          .expect(400)
          .end(done);
      });
    });
    describe('anonymous', function () {
      beforeEach(extendContext({
        user : users.createAnonymous
      }));
      it('should respond 403', function (done) {
        this.user.specRequest()
          .send({ name: 'newCategory' })
          .expect(403)
          .end(done);
      });
    });
    describe('already existing', function () {
      beforeEach(extendContext({
        user : users.createAdmin,
        category : categories.createCategory('newCategory')
      }));
      it('should respond 409', function (done) {
        this.user.specRequest()
          .send({ name: 'newCategory' })
          .expect(409)
          .end(done);
      });
    });
  });

});
