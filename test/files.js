// var users = require('./lib/userFactory');
// var images = require('./lib/imageFactory');
// var helpers = require('./lib/helpers');
// var extendContext = helpers.extendContext;
// var extendContextSeries = helpers.extendContextSeries;
// require('./lib/fixtures/harbourmaster');
// require('./lib/fixtures/dockworker');

// describe('Files', function () {
//   before(extendContext({
//     image: images.createImageFromFixture.bind(images, 'node.js')
//   }));
//   after(helpers.cleanup);

//   describe('GET /users/me/runnables/:containerId/files', function () {
//     beforeEach(extendContextSeries({
//       user: users.createAnonymous,
//       container: ['user.createContainer', ['image._id']]
//     }));
//     afterEach(helpers.cleanupExcept('image'));
//     it('should get a containers files', function (done) {
//       this.user.specRequest(this.container._id)
//         .expect(200)
//         .expectArray() // TODO: verify length
//         .end(done);
//     });
//   });
// });