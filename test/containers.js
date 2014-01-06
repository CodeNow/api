//require('console-trace')({always:true, right:true})
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');

describe('Containers', function () {
  var image;

  before(function (done) {
    images.createImageFromFixture('node.js', function (err, data) {
      if (err) {
        return done(err);
      }
      image = data;
      done();
    });
  });
  after(helpers.cleanup);

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    afterEach(helpers.cleanupExcept('images'));

    it ('should create a container', function (done) {
      var imageId = image._id;
      this.user.specRequest({ from: imageId })
        .expect(201)
        .end(done);
    });
  });
});
