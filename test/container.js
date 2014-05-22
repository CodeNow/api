// var Lab = require('lab');
// var describe = Lab.experiment;
// var it = Lab.test;
// var before = Lab.before;
// var after = Lab.after;
// var beforeEach = Lab.beforeEach;
// var afterEach = Lab.afterEach;
// var expect = Lab.expect;

// var uuid = require('uuid');
// var api = require('./fixtures/api-control');
// var dock = require('./fixtures/dock');
// var nockS3 = require('./fixtures/nock-s3');
// var multi = require('./fixtures/multi-factory');
// var users = require('./fixtures/user-factory');

// describe('Project - /project/:id', function () {
//   var ctx = {};

//   before(api.start.bind(ctx));
//   before(dock.start.bind(ctx));
//   after(api.stop.bind(ctx));
//   after(dock.stop.bind(ctx));
//   afterEach(require('./fixtures/clean-mongo').removeEverything);
//   afterEach(require('./fixtures/clean-ctx')(ctx));

//   describe('POST', function () {
//     beforeEach(function (done) {
//       multi.createRegisteredUserAndProject(function (err, owner, project) {
//         if (err) { return done(err); }

//         ctx.owner = owner;
//         ctx.project = project;
//         done();
//       });
//     });
//     // it('should create a project', function (done) {

//     // });
//     describe('validation errors', function() {
//       it('should require query.from', function (done) {
//         owner.createContainer({ qs: {} }, function (err) {
//           expect(err).to.be.ok;
//           expect(err.output.statusCode).to.equal(400);
//           console.log(err.message);
//           // expect(err.output.statusCode).to.equal(400);
//           done();
//         });
//       });
//       it('should require query.from to be an ObjectId', function (done) {
//         owner.createContainer({ qs: { from: 'bogus' } }, function (err) {
//           expect(err).to.be.ok;
//           expect(err.output.statusCode).to.equal(400);
//           console.log(err.message);
//           // expect(err.output.statusCode).to.equal(400);
//           done();
//         });
//       });
//     });
//   });

//   describe('GET', function () {

//   });


//   describe('PATCH', function () {

//   });


//   describe('DEL', function () {

//   });
// });