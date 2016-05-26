// 'use strict'
//
// var Lab = require('lab')
// var lab = exports.lab = Lab.script()
// var describe = lab.describe
// var it = lab.it
// var before = lab.before
// var beforeEach = lab.beforeEach
// // var after = lab.after
// var afterEach = lab.afterEach
// var expect = require('code').expect
// var sinon = require('sinon')
// var async = require('async')
//
// var DebugContainer = require('models/mongo/debug-container')
// var Docker = require('models/apis/docker')
// var Context = require('models/mongo/context')
// var Instance = require('models/mongo/instance')
// var ContextVersion = require('models/mongo/context-version')
//
// var ctx = {}
//
// var path = require('path')
// var moduleName = path.relative(process.cwd(), __filename)
//
// describe('Debug Containers: ' + moduleName, function () {
//   before(require('../../fixtures/mongo').connect)
//   beforeEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything)
//   afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything)
//
//   beforeEach(function (done) {
//     var c = new Context({
//       owner: { github: 1 },
//       name: 'Foo',
//       lowerName: 'foo'
//     })
//     var cv = new ContextVersion({
//       context: c._id,
//       createdBy: { github: 1 },
//       owner: { github: 1 },
//       dockerHost: 'http://example.com:4242'
//     })
//     var i = new Instance({
//       shortHash: '123abc',
//       name: 'FOO',
//       lowerName: 'foo',
//       owner: { github: 1 },
//       createdBy: { github: 1 },
//       build: cv._id,
//       network: {
//         hostIp: '1.2.3.4'
//       }
//     })
//     ctx.dc = new DebugContainer({
//       contextVersion: cv._id,
//       layerId: 'deadbeef',
//       owner: { github: 1 },
//       instance: c._id,
//       cmd: 'echo your mom'
//     })
//     async.series([
//       c.save.bind(c),
//       cv.save.bind(cv),
//       i.save.bind(i),
//       ctx.dc.save.bind(ctx.dc)
//     ], done)
//   })
//
//   describe('deploy', function () {
//     beforeEach(function (done) {
//       ctx.dc.populate([ 'instance', 'contextVersion' ], done)
//     })
//
//     it('should create, start, and inspect a container', function (done) {
//       var containerStart = sinon.stub().yieldsAsync(null)
//       var containerInspect = sinon.stub().yieldsAsync(null, { Id: 4 })
//       var container = {
//         start: containerStart,
//         inspect: containerInspect
//       }
//       sinon.stub(Docker.prototype, 'createContainer').yieldsAsync(null, container)
//
//       ctx.dc.deploy(function (err, dc) {
//         if (err) { return done(err) }
//         expect(Docker.prototype.createContainer.calledOnce).to.be.true()
//         var createArgs = Docker.prototype.createContainer.getCall(0).args[0]
//         expect(createArgs).to.deep.equal({
//           Cmd: [ 'sleep', '28800' ],
//           Image: dc.layerId,
//           Labels: {
//             type: 'debug-container'
//           }
//         })
//         expect(containerStart.calledOnce).to.be.true()
//         expect(containerInspect.calledOnce).to.be.true()
//         Docker.prototype.createContainer.restore()
//         expect(dc.id).to.equal(ctx.dc.id)
//         done()
//       })
//     })
//   })
//
//   describe('destroyContainer', function () {
//     beforeEach(function (done) {
//       ctx.dc.set('inspect', { Id: 4 })
//       ctx.dc.populate('contextVersion', done)
//     })
//
//     it('should destroy the docker container and remove the model', function (done) {
//       sinon.stub(Docker.prototype, 'stopContainer').yieldsAsync()
//       sinon.stub(Docker.prototype, 'removeContainer').yieldsAsync()
//
//       ctx.dc.destroyContainer(function (err, dc) {
//         if (err) { return done(err) }
//         expect(Docker.prototype.stopContainer.calledOnce).to.be.true()
//         // 4 is the ID above in the before...
//         expect(Docker.prototype.stopContainer.calledWith(4)).to.be.true()
//         expect(Docker.prototype.removeContainer.calledOnce).to.be.true()
//         // 4 is the ID above in the before...
//         expect(Docker.prototype.removeContainer.calledWith(4)).to.be.true()
//         Docker.prototype.stopContainer.restore()
//         Docker.prototype.removeContainer.restore()
//         expect(dc).to.deep.equal(ctx.dc)
//         done()
//       })
//     })
//   })
// })
