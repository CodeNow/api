'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')
var noop = require('101/noop')

require('loadenv')()
var BuildFiles = require('models/apis/build-files')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('build-files: ' + moduleName, function () {
  var model = new BuildFiles('some-context-id')

  describe('copyObject', function () {
    var readStream = { pipe: noop }

    beforeEach(function (done) {
      sinon.stub(model.s3, 'getObject').returns({
        createReadStream: function () { return readStream }
      })
      sinon.stub(model, 'putFileStream').yieldsAsync()
      done()
    })

    afterEach(function (done) {
      model.s3.getObject.restore()
      model.putFileStream.restore()
      done()
    })

    it('should use s3 object streams to perform the copy', function (done) {
      model.copyObject('sourceKey', 'version', 'destKey', function (err) {
        if (err) { return done(err) }
        expect(model.s3.getObject.callCount).to.equal(1)
        var data = {
          Bucket: process.env.S3_CONTEXT_RESOURCE_BUCKET,
          Key: 'sourceKey',
          VersionId: 'version'
        }
        expect(model.s3.getObject.getCall(0).args[0]).to.deep.equal(data)
        expect(model.putFileStream.calledWith('destKey', readStream))
          .to.be.true()
        done()
      })
    })
  })

  describe('getObject', function ()
    var key = 'key'
    var version = 'version'
    var etag = 'etag'
    beforeEach(function (done) {
      sinon.stub(model.s3, 'getObject').yieldsAsync(null, {
        getObjectResults: true
      })

      sinon.stub(model.s3, 'headObject').yieldsAsync(null, {
        ContentLength: 1024
      })
      done()
    })

    afterEach(function (done) {
      model.s3.getObject.restore()
      model.s3.headObject.restore()
      done()
    })

    it('should return the objects contents', function (done) {
      model.getObject(key, version, etag, function (err, data) {
        expect(err).to.not.exist()
        expect(data).to.equal({
          getObjectResults: true
        })
        sinon.assert.calledOnce(model.s3.headObject)
        sinon.assert.calledWith(model.s3.headObject, {
          Bucket: process.env.S3_CONTEXT_RESOURCE_BUCKET,
          Key: 'some-context-id/source',
          VersionId: version,
          IfMatch: etag
        }, sinon.match.func)

        sinon.assert.calledOnce(model.s3.getObject)
        sinon.assert.calledWith(model.s3.getObject, {
          Bucket: process.env.S3_CONTEXT_RESOURCE_BUCKET,
          Key: 'some-context-id/source',
          VersionId: version,
          IfMatch: etag
        }, sinon.match.func)
        done()
      })
    });
    describe('if the object is too large', function () {
      beforeEach(function (done) {
        model.s3.headObject.yieldsAsync(null, {
          ContentLength: 1024000000000000000
        })
        done()
      })
      it('should throw 413 error', function (done) {
        model.getObject(key, version, etag, function (err) {
          expect(err).to.exist()
          expect(err.code).to.equal(413)
          sinon.assert.calledOnce(model.s3.headObject)
          sinon.assert.calledWith(model.s3.headObject, {
            Bucket: process.env.S3_CONTEXT_RESOURCE_BUCKET,
            Key: 'some-context-id/source',
            VersionId: version,
            IfMatch: etag
          }, sinon.match.func)

          sinon.assert.notCalled(model.s3.getObject)
          done()
        })
      });
    })

  })
})
