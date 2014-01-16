// var _ = require('lodash');
// var users = require('./lib/userFactory');
// var images = require('./lib/imageFactory');
// var helpers = require('./lib/helpers');
// var extendContext = helpers.extendContext;
// var extendContextSeries = helpers.extendContextSeries;
// require('./lib/fixtures/harbourmaster');
// require('./lib/fixtures/dockworker');
// var implData = helpers.implData;

// describe('Implementations', function () {
//   before(extendContext({
//     image: images.createImageFromFixture.bind(images, 'node.js')
//   }));
//   afterEach(helpers.cleanupExcept('image'));
//   after(helpers.cleanup);

//   describe('POST /users/me/implementations', function () {
//     beforeEach(extendContextSeries({
//       publ: users.createPublisher,
//       spec: ['publ.createSpecification'],
//       user: users.createAnonymous,
//       container: ['user.createContainer', ['image._id']]
//     }));
//     it('should create an implementation', function (done) {
//       var data = implData(this.spec, this.container._id);
//       var expected = _.omit(_.clone(data), 'containerId');
//       this.user.specRequest()
//         .send(data)
//         .expect(201)
//         .expectBody(expected)
//         .end(done);
//     });
//   });
//   describe('GET /users/me/implementations', function () {
//     beforeEach(extendContextSeries({
//       publ: users.createPublisher,
//       spec: ['publ.createSpecification'],
//       user: users.createAnonymous,
//       container: ['user.createContainer', ['image._id']],
//       impl: ['user.createImplementation', ['spec', 'container._id']]
//     }));
//     // TODO: this really should return an array....
//     it('should get an implementation by "implements"', function (done) {
//       this.user.specRequest({ 'implements': this.spec._id })
//         .expect(200)
//         .expectBody(this.impl)
//         .end(done);
//     });
//   });
//   describe('PUT /users/me/implementations/:implementationId', function () {
//     beforeEach(extendContextSeries({
//       publ: users.createPublisher,
//       spec: ['publ.createSpecification'],
//       spec2: ['publ.createSpecification'],
//       user: users.createAnonymous,
//       container: ['user.createContainer', ['image._id']],
//       container2: ['user.createContainer', ['image._id']],
//       impl: ['user.createImplementation', ['spec', 'container._id']]
//     }));
//     var updateField = function (key, val, done) {
//       var update = implData(this.spec, this.containerId);
//       update[key] = val || 'new';
//       this.user.specRequest(this.impl._id)
//         .send(update)
//         .expect(200)
//         .end(done);
//     };
//     it('should allow update implements', function (done) {
//       updateField.call(this, 'implements', this.spec2._id, done);
//     });
//     it('should allow update requirements', function (done) {
//       var reqs = [];
//       this.spec.requirements.forEach(function (name) {
//         reqs.push({
//           name: name,
//           value: 'newvalue'
//         });
//       });
//       updateField.call(this, 'requirements', reqs, done);
//     });
//     it('should allow update containerId', function (done) {
//       updateField.call(this, 'containerId', this.container2._id, done);
//     });
//   });
// });