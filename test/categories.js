var db = require('./lib/db');
var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;

describe('Categories', function () {
  
  //needs normal user
  describe('POST /categories', function (done) {
    beforeEach(extendContext({
      user : users.createAdmin
    }));
    afterEach(db.dropCollections);
    it('should respond 201', function (done) {
      this.user.specRequest()
        .send({ name: 'newCategory' })
        .expect(201)
        .end(done);
    });
  });

  describe('GET /categories', function (done) {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    afterEach(db.dropCollections);
    it('should respond with an array', function (done) {
      this.user.specRequest()
        .expect(200)
        .expectArray()
        .end(done);
    });

    // it('should allow for queries', function (done) {  
    //   this.user.specRequest({
    //     name: 'facebook'
    //   })
    //     .expect(200)
    //     .expectArray()
    //     .end(done);
    // });
  });

  // describe('GET /categories/:id', function (done) {
  //   beforeEach(extendContext({
  //     user : users.createAnonymous
  //   }));
  //   afterEach(db.dropCollections);
  //   it('should respond with an array', function (done) {
  //     this.user.specRequest()
  //       .expect(200)
  //       .end(done);
  //   });
  // });

});	