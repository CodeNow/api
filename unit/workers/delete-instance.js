'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var worker = require('workers/delete-instance').worker;
var User = require('models/mongo/user');
var Runnable = require('models/apis/runnable');
var createCount = require('callback-count');
var sinon = require('sinon');

describe('delete-instance worker', function () {

  it('should callback with error that user is not found', function (done) {
    var cbCount = createCount(2, done);
    worker({}, function (err) {
      expect(err.output.statusCode).to.equal(404);
      expect(err.output.payload.message).to.equal('User not found');
      cbCount.next();
    }, cbCount.next);
  });

  it('should find user by id and call runnable.destroyInstance', function (done) {
    var cbCount = createCount(3, function () {
      User.findById.restore();
      Runnable.prototype.destroyInstance.restore();
      done();
    });
    var instanceHash = 'a7ae7b';
    sinon.stub(User, 'findById', function (userId, cb) {
      cb(undefined, { _id: userId });
    });
    sinon.stub(Runnable.prototype, 'destroyInstance', function (shortHash, cb) {
      expect(instanceHash).to.equal(instanceHash);
      cb();
      cbCount.next();
    });
    worker({pushUserId: '507f1f77bcf86cd799439011', instanceShortHash: instanceHash}, function (err) {
      expect(err).to.be.undefined();
      cbCount.next();
    }, cbCount.next);
  });

  it('should find user by github id and call runnable.destroyInstance', function (done) {
    var cbCount = createCount(3, function () {
      User.findByGithubId.restore();
      Runnable.prototype.destroyInstance.restore();
      done();
    });
    var instanceHash = 'a7ae7b';
    sinon.stub(User, 'findByGithubId', function (userId, cb) {
      cb(undefined, { _id: userId });
    });
    sinon.stub(Runnable.prototype, 'destroyInstance', function (shortHash, cb) {
      expect(instanceHash).to.equal(instanceHash);
      cb();
      cbCount.next();
    });
    worker({creatorGitHubId: '429706', instanceShortHash: instanceHash}, function (err) {
      expect(err).to.be.undefined();
      cbCount.next();
    }, cbCount.next);
  });

});
