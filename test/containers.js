//require('console-trace')({always:true, right:true})
var users = require('./lib/userFactory');
var images = require('./lib/imageFactory');
var helpers = require('./lib/helpers');
var extendContext = helpers.extendContext;
require('./lib/fixtures/harbourmaster');
require('./lib/fixtures/dockworker');

describe('Containers', function () {
  before(extendContext({
    image: images.createImageFromFixture.bind(images, 'node.js')
  }));
  after(helpers.cleanup);

  describe('POST /users/me/runnables', function () {
    beforeEach(extendContext({
      user : users.createAnonymous
    }));
    afterEach(helpers.cleanupExcept('images'));

    it ('should create a container', function (done) {
      this.user.specRequest({ from: this.image._id })
        .expect(201)
        .end(done);
    });
  });
});
