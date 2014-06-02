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
// var users = require('./fixtures/user-factory');
// var multi = require('./fixtures/multi-factory');
// var expects = require('./fixtures/expects');

// describe('Context Versions - /contexts/:id/versions/:id', function () {
//   var ctx = {};

//   before(api.start.bind(ctx));
//   before(dock.start.bind(ctx));
//   after(api.stop.bind(ctx));
//   after(dock.stop.bind(ctx));
//   afterEach(require('./fixtures/clean-mongo').removeEverything);
//   afterEach(require('./fixtures/clean-ctx')(ctx));

//   beforeEach(function (done) {
//     nockS3();
//     multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
//       if (err) { return done(err); }

//       ctx.user = user;
//       ctx.project = project;
//       ctx.environments = environments;
//       ctx.environment = environments.models[0];

//       var contextId = ctx.environment.toJSON().contexts[0].context;
//       ctx.context = ctx.user.fetchContext(contextId, function (err) {
//         if (err) { return done(err); }

//         ctx.version = ctx.context.fetchVersion('latest', done);
//       });
//     });
//   });

//   describe('BUILD', function () {
//     it('should build a version', function (done) {
//       ctx.version.build(function (err) {
//         done(err);
//       });
//     });
//   });
// });
