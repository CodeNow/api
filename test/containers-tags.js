// FIXME: tags will not be on containers. they will be on projects
// var users = require('./lib/userFactory');
// var helpers = require('./lib/helpers');
// var extendContext = helpers.extendContext;
// var extendContextSeries = helpers.extendContextSeries;
// require('./lib/fixtures/harbourmaster');
// require('./lib/fixtures/dockworker');
// var createCount = require('callback-count');

// var docker = require('./lib/fixtures/docker');
// var docklet = require('./lib/fixtures/docklet');

// describe('Containers Tags', function () {
//   var channelName = 'node.js';

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
//   before(extendContextSeries({
//     admin: users.createAdmin,
//     image: ['admin.createImageFromFixture', ['node.js']],
//     channel: ['admin.createChannel', [channelName]]
//   }));
//   after(helpers.cleanup);

//   describe('POST /users/:userId/runnables/:containerId/tags', function () {
//     var body = { name: channelName };
//     beforeEach(extendContextSeries({
//       owner: users.createAnonymous,
//       container: ['owner.createContainer', ['image._id']]
//     }));
//     describe('owner', function () {
//       it('should create a channel tag', createChannelTag('owner'));
//       it ('should create a channel if it doesnt exist', createNewChannelTag('owner'));
//     });
//     describe('non-owner', function () {
//       describe('anonymous', function () {
//         beforeEach(extendContext('user', users.createAnonymous));
//         it('should error access denied', accessDeniedError);
//       });
//       describe('registered', function () {
//         beforeEach(extendContext('user', users.createRegistered));
//         it('should error access denied', accessDeniedError);
//       });
//       describe('publisher', function () {
//         beforeEach(extendContext('user', users.createPublisher));
//         it('should error access denied', accessDeniedError);
//       });
//       describe('admin', function () {
//         beforeEach(extendContext('user', users.createAdmin));
//         it('should create a channel tag', createChannelTag('owner'));
//         it ('should create a channel if it doesnt exist', createNewChannelTag('owner'));
//       });
//     });
//     function accessDeniedError (done) {
//       this.user.specRequest(this.owner._id, this.container._id)
//         .send(body)
//         .expect(403)
//         .end(done);
//     }
//     function createChannelTag (userKey) {
//       return function (done) {
//         this[userKey].specRequest(this.owner._id, this.container._id)
//           .send(body)
//           .expect(201)
//           .expectBody('_id')
//           .expectBody('channel', this.channel._id)
//           .expectBody('name', body.name)
//           .end(done);
//       };
//     }
//     function createNewChannelTag (userKey) {
//       return function (done) {
//         var newBody =  { name: 'newtag' };
//         this[userKey].specRequest(this.owner._id, this.container._id)
//           .send(newBody)
//           .expect(201)
//           .expectBody('_id')
//           .expectBody('channel')
//           .expectBody('name', newBody.name)
//           .end(done);
//       };
//     }
//   });
// });
