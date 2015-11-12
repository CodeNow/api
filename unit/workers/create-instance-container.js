require('loadenv')();
var path = require('path');

var Lab = require('lab');
var Boom = require('dat-middleware').Boom;
var Code = require('code');
var createInstanceContainer = require('workers/create-instance-container');
var InstanceService = require('models/services/instance-service');
var sinon = require('sinon');
var TaskFatalError = require('ponos').TaskFatalError;

var expect = Code.expect;
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.equal(expectedErr);
    done();
  };
};

var moduleName = path.relative(process.cwd(), __filename);

describe('Worker: create-instance-container: '+moduleName, function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    // valid job
    ctx.job = {
      contextVersionId: '123456789012345678901234',
      instanceId: '123456789012345678901234',
      ownerUsername: 'runnable'
    };
    sinon.stub(InstanceService, 'createContainer');
    done();
  });
  afterEach(function (done) {
    InstanceService.createContainer.restore();
    done();
  });

  describe('success', function() {
    beforeEach(function (done) {
      InstanceService.createContainer.yieldsAsync();
      done();
    });

    it('should call InstanceService.createContainer', function (done) {
      createInstanceContainer(ctx.job)
        .then(function () {
          sinon.assert.calledWith(InstanceService.createContainer, ctx.job);
          done();
        })
        .catch(done);
    });
  });

  describe('error', function () {
    describe('unknown error', function() {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        InstanceService.createContainer.yieldsAsync(ctx.err);
        done();
      });

      it('should call InstanceService.createContainer', function (done) {
        createInstanceContainer(ctx.job)
          .catch(expectErr(ctx.err, done));
      });
    });

    describe('4XX err', function() {
      beforeEach(function (done) {
        ctx.err = Boom.notFound('boom');
        InstanceService.createContainer.yieldsAsync(ctx.err);
        done();
      });

      it('should call InstanceService.createContainer', function (done) {
        createInstanceContainer(ctx.job)
          .catch(TaskFatalError, function (err) {
            expect(err.data.originalError).to.equal(ctx.err);
            done();
          })
          .catch(done);
      });
    });
  });
});
