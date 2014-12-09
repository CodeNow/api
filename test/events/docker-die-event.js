// var Lab = require('lab');
// var describe = Lab.experiment;

// var before = Lab.before;
// var after = Lab.after;
// var beforeEach = Lab.beforeEach;

// var find = require('101/find');
// var hasKeypaths = require('101/has-keypaths');

// var api = require('../../fixtures/api-control');
// var dock = require('../../fixtures/dock');
// var multi = require('../../fixtures/multi-factory');
// var pubsub = require('models/redis/pubsub');


// var typesTests = require('../../fixtures/types-test-util');

// describe('EVENT runnable:docker:events:die', function () {
//   var ctx = {};

//   before(api.start.bind(ctx));
//   before(dock.start.bind(ctx));
//   before(require('../../fixtures/mocks/api-client').setup);
//   after(api.stop.bind(ctx));
//   after(dock.stop.bind(ctx));
//   after(require('../../fixtures/mocks/api-client').clean);

//   describe('container dies naturally', function() {
//     beforeEach(function (done) {
//       multi.createContainer(function (err, container, instance) {
//         if (err) { return done(err); }
//         ctx.instance = instance;
//         ctx.container = container;
//         expect(instance.attrs.container.inspect.State.Running).to.equal(true);
//         done();
//       });
//     });
//     describe('container die event handler', function() {
//       beforeEach(function (done) {
//         ctx.origHandleDie = dockerEvents.events.die;
//         done();
//       });
//       afterEach(function (done) {
//         dockerEvents.events.die = ctx.origHandleDie;
//         done();
//       });
//       it('should recieve the docker die event', function (done) {
//         container.events.die = done;
//         var docker = new Docker(instance.attrs.container.dockerHost);
//         docker.stopContainer(instance.attrs.container, done);
//       });
//     });
//   });
//   describe('user stops the instance\'s container', function() {

//   });
// });
