// var Lab = require('lab');
// var describe = Lab.experiment;
// var it = Lab.test;
// var before = Lab.before;
// var after = Lab.after;
// var beforeEach = Lab.beforeEach;
// var afterEach = Lab.afterEach;
// var expect = Lab.expect;

// var api = require('./fixtures/api-control');
// var dock = require('./fixtures/dock');
// var nockS3 = require('./fixtures/nock-s3');
// var multi = require('./fixtures/multi-factory');

// describe('Context - /contexts/:id', function () {
//   var ctx = {};

//   before(api.start.bind(ctx));
//   before(dock.start.bind(ctx));
//   after(api.stop.bind(ctx));
//   after(dock.stop.bind(ctx));
//   afterEach(require('./fixtures/clean-mongo').removeEverything);
//   afterEach(require('./fixtures/clean-ctx')(ctx));

//   describe('GET', function () {
//     beforeEach(function (done) {
//       nockS3();
//       multi.createRegisteredUserAndProject(function (err, owner, project) {
//         ctx.owner = owner;
//         ctx.project = project;
//         done(err);
//       });
//     });

//     it('should get the context information', function (done) {
//       ctx.project.fetchEnvironments(function (err, body) {
//         if (err) { return done(err); }
//         var contextId = body[0].contexts[0].context;
//         ctx.owner.fetchContext(contextId, function (err, body, code) {
//           if (err) { return done(err); }

//           expect(code).to.equal(200);
//           expect(body).to.have.property('_id', contextId);
//           done();
//         });
//       });
//     });
//   });
// });
