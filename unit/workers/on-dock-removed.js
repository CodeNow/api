// 'use strict'
//
// require('loadenv')()
//
// var Lab = require('lab')
// var lab = exports.lab = Lab.script()
// var describe = lab.describe
// var it = lab.it
// var afterEach = lab.afterEach
// var beforeEach = lab.beforeEach
// var Code = require('code')
// var expect = Code.expect
//
// var sinon = require('sinon')
// var Instance = require('models/mongo/instance')
// var Worker = require('workers/on-dock-removed')
//
// var path = require('path')
// var moduleName = path.relative(process.cwd(), __filename)
//
// describe('worker: on-dock-removed unit test: ' + moduleName, function () {
//   var worker
//   beforeEach(function (done) {
//     done()
//   })
//
//   describe('#handle', function () {
//     var testHost = 'goku'
//     var testData = {
//       host: testHost
//     }
//
//     beforeEach(function (done) {
//       worker = new Worker(testData)
//       sinon.stub(worker.runnableClient, 'githubLogin')
//       sinon.stub(Instance, 'findActiveInstancesByDockerHost')
//       done()
//     })
//
//     afterEach(function (done) {
//       worker.runnableClient.githubLogin.restore()
//       Instance.findActiveInstancesByDockerHost.restore()
//       done()
//     })
//
//     describe('github login fails', function () {
//       var testErr = 'spirit bomb'
//       beforeEach(function (done) {
//         worker.runnableClient.githubLogin.yieldsAsync(testErr)
//         done()
//       })
//
//       it('should cb err', function (done) {
//         worker.handle(function (err) {
//           expect(err).to.not.exist()
//           expect(
//             worker.runnableClient.githubLogin
//               .withArgs(process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
//               .calledOnce).to.be.true()
//           expect(
//             Instance.findActiveInstancesByDockerHost
//               .called).to.be.false()
//           done()
//         })
//       })
//     }) // end github login fails
//
//     describe('github login works', function () {
//       var testErr = 'kamehameha'
//       beforeEach(function (done) {
//         worker.runnableClient.githubLogin.yieldsAsync()
//         sinon.stub(Worker.prototype, '_redeployContainers')
//         done()
//       })
//
//       afterEach(function (done) {
//         Worker.prototype._redeployContainers.restore()
//         done()
//       })
//
//       describe('findActiveInstancesByDockerHost errors', function () {
//         beforeEach(function (done) {
//           Instance.findActiveInstancesByDockerHost.yieldsAsync(testErr)
//           done()
//         })
//
//         it('should cb err', function (done) {
//           worker.handle(function (err) {
//             expect(
//               worker.runnableClient.githubLogin
//                 .withArgs(process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
//                 .calledOnce).to.be.true()
//             expect(
//               Instance.findActiveInstancesByDockerHost
//                 .withArgs(testHost)
//                 .calledOnce).to.be.true()
//             expect(err).to.not.exist()
//             done()
//           })
//         })
//       }) // end findActiveInstancesByDockerHost error
//
//       describe('findActiveInstancesByDockerHost return empty', function () {
//         beforeEach(function (done) {
//           Instance.findActiveInstancesByDockerHost.yieldsAsync(null, [])
//           done()
//         })
//
//         it('should cb right away', function (done) {
//           worker.handle(function (err) {
//             expect(err).to.be.undefined()
//             expect(
//               worker.runnableClient.githubLogin
//                 .withArgs(process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
//                 .calledOnce).to.be.true()
//             expect(
//               Instance.findActiveInstancesByDockerHost
//                 .withArgs(testHost)
//                 .calledOnce).to.be.true()
//             expect(
//               Worker.prototype._redeployContainers
//                 .called).to.be.false()
//             done()
//           })
//         })
//       }) // end findActiveInstancesByDockerHost return empty
//
//       describe('findActiveInstancesByDockerHost returns array', function () {
//         var testArray = ['1', '2']
//         beforeEach(function (done) {
//           Instance.findActiveInstancesByDockerHost.yieldsAsync(null, testArray)
//           Worker.prototype._redeployContainers.yieldsAsync()
//           done()
//         })
//
//         it('should call _redeployContainers', function (done) {
//           worker.handle(function (err) {
//             expect(err).to.be.undefined()
//             expect(
//               worker.runnableClient.githubLogin
//                 .withArgs(process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
//                 .calledOnce).to.be.true()
//             expect(
//               Instance.findActiveInstancesByDockerHost
//                 .withArgs(testHost)
//                 .calledOnce).to.be.true()
//             expect(
//               Worker.prototype._redeployContainers
//                 .withArgs(testArray)
//                 .called).to.be.true()
//             done()
//           })
//         })
//       }) // end findActiveInstancesByDockerHost returns array
//     }) // end github login works
//   }) // end #handle
//
//   describe('#_redeployContainers', function () {
//     var testErr = 'fire'
//     var testData = [{
//       id: '1'
//     }, {
//       id: '2'
//     }]
//     var redeployStub
//     beforeEach(function (done) {
//       redeployStub = sinon.stub()
//       worker.runnableClient.newInstance = sinon.stub().returns({
//         redeploy: redeployStub
//       })
//       done()
//     })
//
//     describe('redeploy fails for one instance', function () {
//       beforeEach(function (done) {
//         redeployStub.onCall(0).yieldsAsync(testErr)
//         redeployStub.onCall(1).yieldsAsync()
//         done()
//       })
//
//       it('should callback with no error', function (done) {
//         worker._redeployContainers(testData, function (err) {
//           expect(err).to.be.undefined()
//           expect(redeployStub
//             .calledTwice).to.be.true()
//           done()
//         })
//       })
//     }) // end redeploy fails for one instance
//
//     describe('redeploy passes', function () {
//       beforeEach(function (done) {
//         redeployStub.onCall(0).yieldsAsync()
//         redeployStub.onCall(1).yieldsAsync()
//         done()
//       })
//
//       it('should callback with no error', function (done) {
//         worker._redeployContainers(testData, function (err) {
//           expect(err).to.be.undefined()
//           expect(redeployStub
//             .calledTwice).to.be.true()
//           done()
//         })
//       })
//     }) // end redeploy passes
//   }) // end _redeployContainers
// }) // end worker: on-dock-removed unit test
