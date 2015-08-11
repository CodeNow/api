'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
// var beforeEach = lab.beforeEach;
// var after = lab.after;
// var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var through = require('through');
var sinon = require('sinon');
var Docker = require('models/apis/docker');
var stream = require('stream');

var BuildStream = require('socket/build-stream').BuildStream;

var ctx = {};
describe('build stream', function () {
  before(function (done) {
    var socket = {};
    var id = 4;
    var data = {
      id: 4,
      streamId: 17
    };
    ctx.buildStream = new BuildStream(socket, id, data);
    done();
  });

  it('should pipe docker logs to a client stream', function (done) {
    var readableStream = new stream.PassThrough();
    var b = new Buffer('010000000000002f', 'hex');
    var c = new Buffer('49676e20687474703a2f2f617263686976652e7562756e747' +
      '52e636f6d2074727573747920496e52656c656173650a', 'hex');
    readableStream.write(b);
    readableStream.write(c);
    readableStream.end();
    sinon.stub(Docker.prototype, 'getLogs').yieldsAsync(null, readableStream);
    sinon.spy(ctx.buildStream, '_writeErr');
    var writeStream = through();
    writeStream.stream = true;
    var version = {
      dockerHost: 'http://example.com:4242',
      containerId: 55
    };

    ctx.buildStream._pipeBuildLogsToClient(version, writeStream);
    expect(ctx.buildStream._writeErr.callCount).to.equal(0);

    Docker.prototype.getLogs.restore();
    ctx.buildStream._writeErr.restore();

    writeStream.on('data', function (data) {
      console.log('data: ' + data);
    });
    done();
  });
  // after(function (done) {});
});
