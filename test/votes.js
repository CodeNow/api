// FIXME: votes will be on projects, not images
// var users = require('./lib/userFactory');
// var images = require('./lib/imageFactory');
// var helpers = require('./lib/helpers');
// var extendContext = helpers.extendContext;
// var extendContextSeries = helpers.extendContextSeries;
// var createCount = require('callback-count');
// var docker = require('./lib/fixtures/docker');
// var docklet = require('./lib/fixtures/docklet');

// describe('Votes', function () {
//   before(function (done) {
//     var count = createCount(done);
//     this.docklet = docklet.start(count.inc().next);
//     this.docker  = docker.start(count.inc().next);
//   });
//   after(function (done) {
//     var count = createCount(done);
//     this.docklet.stop(count.inc().next);
//     this.docker.stop(count.inc().next);
//   });
//   before(extendContext({
//     image: images.createImageFromFixture.bind(images, 'node.js')
//   }));
//   after(helpers.cleanup);
//   afterEach(helpers.cleanupExcept('image'));

//   describe('POST /users/me/votes', function () {
//     beforeEach(extendContext({
//       user : users.createAnonymous
//     }));
//     it('should create a vote', function (done) {
//       this.user.specRequest()
//         .send({ runnable: this.image._id })
//         .expect(201)
//         .end(done);
//     });
//     it('should respond 404 if image not found', function (done) {
//       this.user.specRequest()
//         .send({ runnable: helpers.fakeShortId() })
//         .expect(404)
//         .end(done);
//     });
//   });

//   describe('GET /users/me', function () {
//     beforeEach(extendContextSeries({
//       user: users.createAnonymous,
//       vote: ['user.post', ['/users/me/votes', {
//         body: { runnable: 'image._id' },
//         expect: 201
//       }]]
//     }));
//     it('should have user\'s votes', function (done) {
//       var self = this;
//       this.user.specRequest()
//         .expect(200)
//         .expectBody(function (body) {
//           body.votes[0].should.have.property('runnable', self.image._id);
//         })
//         .end(done);
//     });
//   });
//   describe('DEL /users/me/votes/:voteId', function () {
//     beforeEach(extendContextSeries({
//       user: users.createAnonymous,
//       vote: ['user.post', ['/users/me/votes', {
//         body: { runnable: 'image._id' },
//         expect: 201
//       }]]
//     }));
//     it('should remove users\'s vote', function (done) {
//       var self = this;
//       var checkDone = helpers.createCheckDone(done);
//       this.user.specRequest(this.vote.body._id)
//         .expect(200)
//         .end(checkDone.done());
//       this.user.get('/users/me')
//         .expect(200)
//         .expectBody(function (body) {
//           body.votes[0].should.have.property('runnable', self.image._id);
//         })
//         .end(checkDone.done());
//     });
//   });
// });
