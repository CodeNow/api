// var Lab = require('lab');
// var describe = Lab.experiment;
// var it = Lab.test;
// var beforeEach = Lab.beforeEach;
// var afterEach = Lab.afterEach;

// var clone = require('clone');
// var Runnable = require('runnable');
// var api = require('index');
// var docklet = require('./lib/fixtures/docklet');
// var docker = require('./lib/fixtures/docker');
// var createCount = require('callback-count');

// var url = '/projects';
// describe(url, function () {
//   beforeEach(function (done) {
//     var count = createCount(done);
//     this.runnable = new Runnable();
//     count.inc();
//     this.registered.anon(function () {

//     });
//     this.api = api.start(count.inc().next);
//     this.docklet = docklet.start(count.inc().next);
//     this.docker = docker.start(count.inc().next);
//   });
//   afterEach(function (done) {
//     this.api.stop(done);
//     delete this.api;
//     delete this.docklet;
//     delete this.docker;
//   });
//   describe('POST '+url, function () {
//     var body = {};
//     var requiredBodyKeys = [''];

//     it('should create a project', function(done) {
//       this.runnable.post(url, { json: body }, function (err, body) {

//       });
//     });
//     requiredBodyKeys.forEach(function (missingBodyKey) {
//       it('should error if missing a '+missingBodyKey, function (done) {
//         var incompleteBody = clone(body);
//         delete incompleteBody[missingBodyKey];

//         this.registered.post(url, { json: body }, function (err, res, body) {
//           expect(err)
//         });
//       });
//     });
//   });
//   describe('GET '+url, function () {

//   });
//   describe('PATCH '+url, function () {

//   });
//   describe('DEL '+url, function () {

//   });
// });

