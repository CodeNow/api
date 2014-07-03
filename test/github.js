// var Lab = require('lab');
// var describe = Lab.experiment;
// var it = Lab.test;
// var before = Lab.before;
// var after = Lab.after;
// var afterEach = Lab.afterEach;
// var beforeEach = Lab.beforeEach;
// var expect = Lab.expect;
// var request = require('request');

// var api = require('./fixtures/api-control');
// var hooks = require('./fixtures/github-hooks');
// var nockS3 = require('./fixtures/nock-s3');
// var multi = require('./fixtures/multi-factory');
// var dock = require('./fixtures/dock');

// describe('Github', function () {
//   var ctx = {};

//   before(api.start.bind(ctx));
//   after(api.stop.bind(ctx));
//   before(dock.start.bind(ctx));
//   after(dock.stop.bind(ctx));
//   beforeEach(require('./fixtures/nock-github'));
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
//       var builds = ctx.environment.fetchBuilds(function (err) {
//         if (err) { return done(err); }
//         ctx.build = builds.models[0];
//         ctx.contextId = ctx.build.toJSON().contexts[0];
//         ctx.versionId = ctx.build.toJSON().versions[0];
//         ctx.context = ctx.user.fetchContext(ctx.contextId, function (err) {
//           if (err) { return done(err); }
//           ctx.context.update({ json: {
//             source: [{
//               sourceType: 'github',
//               location: 'bkendall/flaming-octo-nemesis'
//             }]
//           }}, done);
//         });
//       });
//     });
//   });

//   describe('ping', function () {
//     it('should return OKAY', function (done) {
//       var options = hooks.ping;
//       request.post(options, function (err, res, body) {
//         if (err) { return done(err); }

//         expect(res.statusCode).to.equal(204);
//         expect(body).to.equal(undefined);
//         done();
//       });
//     });
//   });

//   describe('push', function () {
//     it('should start a build', function (done) {
//       var options = hooks.push;
//       request.post(options, function (err, res, body) {
//         if (err) { return done(err); }

//         expect(body).to.be.okay;
//         console.log(body);
//         expect(res.statusCode).to.equal(201);
//         done();
//       });
//     });
//     it('should return 404 if no context has request set up', function (done) {
//       var options = hooks.push;
//       options.json.repository.name = 'fake-name';
//       request.post(options, function (err, res) {
//         if (err) { return done(err); }

//         expect(res.statusCode).to.equal(404);
//         expect(res.body.message).to.match(/not found/);
//         done();
//       });
//     });
//   });
// });
