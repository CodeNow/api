'use strict';

require('loadenv')();

var sinon = require('sinon');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var User = require('models/mongo/user');
var Messenger = require('socket/messenger');

describe('Messenger', function () {
  describe('canJoin', function () {
    it('should return true if authToken provided', function (done) {
      var socket = {
        request: {
          query: {
            token: 'some-token'
          }
        }
      };
      Messenger.canJoin(socket, 'some-id', {}, function (err, canJoin) {
        expect(err).to.be.null();
        expect(canJoin).to.be.true();
        done();
      });
    });
    it('should return false if both authToken and userId are null', function (done) {
      var socket = {
        request: {
          query: {
            token: null
          },
          session: {
            passport: {
              user: null
            }
          }
        }
      };
      Messenger.canJoin(socket, 'some-id', {}, function (err, canJoin) {
        expect(err).to.be.null();
        expect(canJoin).to.be.false();
        done();
      });
    });
    it('should return true if accountId equals userId', function (done) {
      var socket = {
        request: {
          session: {
            passport: {
              user: 'some-user-id'
            }
          }
        }
      };
      Messenger.canJoin(socket, 'some-id', { name: 'some-user-id' }, function (err, canJoin) {
        expect(err).to.be.null();
        expect(canJoin).to.be.true();
        done();
      });
    });
  });
  it('should return error if user search callbacks with error', function (done) {
    var socket = {
      request: {
        session: {
          passport: {
            user: 'some-user-id'
          }
        }
      }
    };
    sinon.stub(User, 'findByGithubId').yields(new Error('Mongoose error'));
    Messenger.canJoin(socket, 'some-id', { name: 'some-org-id' }, function (err, canJoin) {
      expect(err.message).to.equal('Mongoose error');
      expect(canJoin).to.be.undefined();
      User.findByGithubId.restore();
      done();
    });
  });
  it('should return error if user not found', function (done) {
    var socket = {
      request: {
        session: {
          passport: {
            user: 'some-user-id'
          }
        }
      }
    };
    sinon.stub(User, 'findByGithubId').yields(null, null);
    Messenger.canJoin(socket, 'some-id', { name: 'some-org-id' }, function (err, canJoin) {
      expect(err.output.statusCode).to.equal(404);
      expect(err.output.payload.message).to.equal('User not found');
      expect(canJoin).to.be.undefined();
      User.findByGithubId.restore();
      done();
    });
  });
  it('should return error if org search callbacks with error', function (done) {
    var socket = {
      request: {
        session: {
          passport: {
            user: 'some-user-id'
          }
        }
      }
    };
    var user = new User();
    sinon.stub(User, 'findByGithubId').yields(null, user);
    sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(new Error('Mongoose error'));
    Messenger.canJoin(socket, 'some-id', { name: 'some-org-id' }, function (err, canJoin) {
      expect(err.message).to.equal('Mongoose error');
      expect(canJoin).to.be.undefined();
      User.findByGithubId.restore();
      User.prototype.findGithubOrgByGithubId.restore();
      done();
    });
  });
  it('should return error if org not found', function (done) {
    var socket = {
      request: {
        session: {
          passport: {
            user: 'some-user-id'
          }
        }
      }
    };
    var user = new User();
    sinon.stub(User, 'findByGithubId').yields(null, user);
    sinon.stub(User.prototype, 'findGithubOrgByGithubId').yields(null, null);
    Messenger.canJoin(socket, 'some-id', { name: 'some-org-id' }, function (err, canJoin) {
      expect(err.output.statusCode).to.equal(404);
      expect(err.output.payload.message).to.equal('Org not found');
      expect(canJoin).to.be.undefined();
      User.findByGithubId.restore();
      User.prototype.findGithubOrgByGithubId.restore();
      done();
    });
  });
});
