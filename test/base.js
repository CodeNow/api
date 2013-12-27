var helpers = require('./lib/helpers');

describe('GET /', function() {
  beforeEach(helpers.setupAnonRequest);
  afterEach(helpers.dropCollections);
  it('should respond "runnable api"', function(done) {
    this.request()
      .expect(200, {message: 'runnable api'})
      .end(done);
  });
});

describe('GET /super-fake-route', function() {
  beforeEach(helpers.setupAnonRequest);
  afterEach(helpers.dropCollections);
  it('should respond 404', function(done) {
    this.request()
      .expect(404)
      .end(done);
  });
});
