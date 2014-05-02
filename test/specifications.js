// var _ = require('lodash');
// var users = require('./lib/userFactory');
// var helpers = require('./lib/helpers');
// var expect = require('./lib/expect');
// var extendContext = helpers.extendContext;
// var extendContextSeries = helpers.extendContextSeries;
// var specData = helpers.specData;

// describe('Specifications', function () {
//   afterEach(helpers.cleanup);

//   describe('POST /specifications', function () {
//     describe('anonymous', function () {
//       beforeEach(extendContext({
//         user : users.createAnonymous
//       }));
//       it('should error access denied', expect.accessDenied);
//     });
//     describe('registered', function () {
//       beforeEach(extendContext({
//         user : users.createRegistered
//       }));
//       it('should create a specification', createSpec);
//       it('should error if missing name', function (done) {
//         var data = specData();
//         delete data.name;
//         this.user.specRequest()
//           .send(data)
//           .expect(400)
//           .end(done);
//       });
//       describe('already exists', function () {
//         beforeEach(extendContextSeries({
//           spec: ['user.createSpecification', [specData()]],
//         }));
//         it('should error if duplicate name', function (done) {
//           this.user.specRequest()
//             .send(specData())
//             .expect(409)
//             .expectBody('message', /already exists/)
//             .end(done);
//         });
//       });
//     });
//     describe('admin', function () {
//       beforeEach(extendContext({
//         user : users.createAdmin
//       }));
//       it('should create a specification', createSpec);
//     });
//   });
//   function createSpec (done) {
//     var data = specData();
//     var expect = _.extend(_.clone(data), { owner: this.user._id });
//     this.user.specRequest()
//       .send(data)
//       .expectBody(expect)
//       .end(done);
//   }
//   describe('GET /specifications/:id', function () {
//     beforeEach(extendContextSeries({
//       admin: users.createAdmin,
//       spec: ['admin.createSpecification', [specData()]],
//       user: users.createAnonymous
//     }));
//     it('should get a specification', function (done) {
//       this.user.specRequest(this.spec._id)
//         .expect(200)
//         .expectBody(specData())
//         .end(done);
//     });
//     it('should 404 when not found', function (done) {
//       this.user.specRequest(helpers.fakeId())
//         .expect(404)
//         .end(done);
//     });
//   });

//   describe('PUT /specifications/:id', function () {
//     beforeEach(extendContextSeries({
//       publ: users.createPublisher,
//       spec: ['publ.createSpecification', [specData()]]
//     }));
//     describe('owner', function () {
//       it('should allow update name', updateField('name'));
//       it('should allow update description', updateField('description'));
//       it('should allow update instructions', updateField('instructions'));
//       it('should allow update requirements', updateField('requirements', ['two', 'three']));
//       function updateField (key, val) {
//         return function (done) {
//           val = val || 'new';
//           var update = specData();
//           update[key] = val;
//           this.publ.specRequest(this.spec._id)
//             .send(update)
//             .expect(200)
//             .expectBody(key, val)
//             .end(done);
//         };
//       }
//     });
//     describe('nonowner', function () {
//       beforeEach(extendContext({
//         user: users.createAnonymous
//       }));
//       it('should deny update', function (done) {
//         var update = specData();
//         this.user.specRequest(this.spec._id)
//           .send(update)
//           .expect(403)
//           .end(done);
//       });
//     });
//   });

//   describe('GET /specifications', function () {
//     describe('no specification', function () {
//       beforeEach(extendContext({
//         user: users.createAnonymous
//       }));
//       it('should respond empty array', function (done) {
//         this.user.specRequest()
//           .expect(200)
//           .expectArray(0)
//           .end(done);
//       });
//     });
//     describe('specifications exist', function () {
//       beforeEach(extendContextSeries({
//         publ: users.createPublisher,
//         spec: ['publ.createSpecification'],
//         publ2: users.createPublisher,
//         spec2: ['publ2.createSpecification'],
//         spec3: ['publ2.createSpecification'],
//         user: users.createAnonymous
//       }));
//       it('should return all specifications', function (done) {
//         this.user.specRequest()
//           .expect(200)
//           .expectArray(3)
//           .end(done);
//       });
//     });
//   });

// });
