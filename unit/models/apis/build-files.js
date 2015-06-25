'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');
var noop = require('101/noop');

require('loadenv')();
var BuildFiles = require('models/apis/build-files');

describe('build-files', function() {
  var model = new BuildFiles('some-context-id');

  // TODO Update s3-stream-upload past 0.0.6 and we can more easily test this
  // describe('putFileStream', function() {
  //   var stream = { pipe: noop, on: noop };
  //
  //   beforeEach(function (done) {
  //     sinon.stub(stream, 'pipe').returns({
  //       on: noop,
  //       _uploader: {
  //         once: noop
  //       }
  //     });
  //     sinon.spy(stream, 'on');
  //     done();
  //   });
  //
  //   afterEach(function (done) {
  //     stream.on.restore();
  //     done();
  //   });
  //
  //   it('should handle errors on streams', function(done) {
  //     model.putFileStream('key', stream, noop);
  //     expect(stream.on.calledWith('error')).to.be.true();
  //     done();
  //   });
  // });

  describe('copyObject', function() {
    var readStream = { pipe: noop };

    beforeEach(function (done) {
      sinon.stub(model.s3, 'getObject').returns({
        createReadStream: function () { return readStream; }
      });
      sinon.stub(model, 'putFileStream').yieldsAsync();
      done();
    });

    afterEach(function (done) {
      model.s3.getObject.restore();
      model.putFileStream.restore();
      done();
    });

    it('should use s3 object streams to perform the copy', function(done) {
      model.copyObject('sourceKey', 'version', 'destKey', function (err) {
        if (err) { return done(err); }
        expect(model.putFileStream.calledWith('destKey', readStream))
          .to.be.true();
        done();
      });
    });
  });
});
