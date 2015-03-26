'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var resSendAndNext = require('middlewares/send-and-next');
var createCount = require('callback-count');

describe('send-and-next', function () {
  it('should call next and send response with status code', function (done) {
    var count = createCount(2, done);
    var req = {};
    var res = {
      sendStatus: function (statusCode) {
        expect(statusCode).to.equal(201);
        count.next();
      }
    };
    resSendAndNext(201)(req, res, count.next);
  });

  it('should call next and send response with status code and body', function (done) {
    var count = createCount(2, done);
    var req = {
      user: {
        name: 'anton'
      }
    };
    var res = {
      send: function (statusCode, user) {
        expect(statusCode).to.equal(201);
        expect(user.name).to.equal('anton');
        count.next();
      }
    };
    resSendAndNext(201, 'user')(req, res, count.next);
  });
});
