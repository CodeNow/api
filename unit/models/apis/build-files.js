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
