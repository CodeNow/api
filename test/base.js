var helpers = require('./lib/helpers');
var db = require('./lib/db');
var users = require('./lib/userFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;

describe('GET /', function() {
  beforeEach(extendContext('user', users.createAnonymous));
  afterEach(db.dropCollections);
  it('should respond "runnable api"', function(done) {
    this.user.specRequest()
      .expect(200, {message: 'runnable api'})
      .end(done);
  });
});

describe('GET /super-fake-route', function() {
  beforeEach(extendContext('user', users.createAnonymous));
  afterEach(db.dropCollections);
  it('should respond 404', function(done) {
    this.user.specRequest()
      .expect(404)
      .end(done);
  });
});
