'use strict';

require('loadenv')();

var sinon = require('sinon');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

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
});
