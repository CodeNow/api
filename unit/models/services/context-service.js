'use strict';

require('loadenv')();

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = require('code').expect;
var it = lab.it;

// external
var sinon = require('sinon');

// internal
var Context = require('models/mongo/context');
var ContextVersion = require('models/mongo/context-version');
var Runnable = require('models/apis/runnable');

// internal (being tested)
var ContextService = require('models/services/context-service');

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('ContextService: ' + moduleName, function () {
  var ctx = {};
  beforeEach(function (done) {
    sinon.stub(Context.prototype, 'save').yieldsAsync();
    sinon.stub(ContextVersion, 'createDeepCopy').yieldsAsync();
    sinon.stub(Runnable.prototype, 'copyVersionIcvFiles').yieldsAsync();
    done();
  });
  afterEach(function (done) {
    Context.prototype.save.restore();
    ContextVersion.createDeepCopy.restore();
    Runnable.prototype.copyVersionIcvFiles.restore();
    done();
  });

  describe('.handleVersionDeepCopy', function () {
    beforeEach(function (done) {
      ctx.mockContextVersion = {
        infraCodeVersion: 'pizza',
        owner: { github: 1234 }
      };
      ctx.mockContext = {
        owner: { github: 1234 }
      };
      ctx.mockUser = {
        accounts: {
          github: { id: 1234 }
        }
      };
      done();
    });

    describe('a CV owned by hellorunnable', function () {
      beforeEach(function (done) {
        ctx.returnedMockedContextVersion = {
          _id: 'deadb33f',
          owner: { github: -1 },
          // createDeepCopy sets the correct createdBy
          createdBy: { github: 1234 },
          save: sinon.stub().yieldsAsync()
        };
        ctx.mockContextVersion.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID;
        ContextVersion.createDeepCopy.yieldsAsync(null, ctx.returnedMockedContextVersion);
        ctx.mockContext.owner.github = process.env.HELLO_RUNNABLE_GITHUB_ID;
        done();
      });

      it('should do a hello runnable copy', function (done) {
        // save's callback returns [ document, numberAffected ]
        ctx.returnedMockedContextVersion.save.yields(null, ctx.returnedMockedContextVersion, 1);
        ContextService.handleVersionDeepCopy(
          ctx.mockContext,
          ctx.mockContextVersion,
          ctx.mockUser,
          function (err, contextVersion) {
            if (err) { return done(err); }
            // the contextVersion that we receive should be the new one we 'creatd'
            expect(contextVersion).to.equal(ctx.returnedMockedContextVersion);
            sinon.assert.calledOnce(ContextVersion.createDeepCopy);
            sinon.assert.calledWith(
              ContextVersion.createDeepCopy,
              ctx.mockUser,
              ctx.mockContextVersion,
              sinon.match.func);
            sinon.assert.calledOnce(ctx.returnedMockedContextVersion.save);
            expect(ctx.returnedMockedContextVersion.owner.github).to.equal(ctx.mockUser.accounts.github.id);
            sinon.assert.calledOnce(Context.prototype.save);
            sinon.assert.calledOnce(Runnable.prototype.copyVersionIcvFiles);
            sinon.assert.calledWith(
              Runnable.prototype.copyVersionIcvFiles,
              sinon.match.any,
              ctx.returnedMockedContextVersion._id,
              ctx.mockContextVersion.infraCodeVersion,
              sinon.match.func);
            done();
          });
      });

      it('should propogate save contextVersion failures', function (done) {
        var error = new Error('Whoa!');
        ctx.returnedMockedContextVersion.save.yieldsAsync(error);
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error);
          sinon.assert.calledOnce(ctx.returnedMockedContextVersion.save);
          done();
        });
      });

      it('should propogate contextVersion.createDeepCopy failures', function (done) {
        var error = new Error('Whoa Nelly!');
        ContextVersion.createDeepCopy.yieldsAsync(error);
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error);
          sinon.assert.calledOnce(ContextVersion.createDeepCopy);
          sinon.assert.notCalled(ctx.returnedMockedContextVersion.save);
          done();
        });
      });
    });

    describe('a CV owned by a any user, not hellorunnable', function () {
      it('should do a regular deep copy', function (done) {
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          if (err) { return done(err); }
          sinon.assert.calledOnce(ContextVersion.createDeepCopy);
          sinon.assert.calledWith(
            ContextVersion.createDeepCopy,
            ctx.mockUser,
            ctx.mockContextVersion,
            sinon.match.func);
          done();
        });
      });
      it('should propogate copy failures', function (done) {
        var error = new Error('foobar');
        ContextVersion.createDeepCopy.yieldsAsync(error);
        ContextService.handleVersionDeepCopy(ctx.mockContext, ctx.mockContextVersion, ctx.mockUser, function (err) {
          expect(err).to.equal(error);
          sinon.assert.calledOnce(ContextVersion.createDeepCopy);
          done();
        });
      });
    });
  });
});
