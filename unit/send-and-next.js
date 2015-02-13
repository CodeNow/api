'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var resSendAndNext = require('middlewares/send-and-next');
var createCount = require('callback-count');


var ctx = {};

describe('send-and-next', function () {


  it('should call next and send response with status code', function (done) {
    var count = createCount(2, done);
    var next = function () {
      count.next();
    };
    var req = {};
    var res = {
      sendStatus: function (statusCode) {
        expect(statusCode).to.equal(201);
        count.next();
      }
    };
    resSendAndNext(201)(req, res, next);
  });

  it('should call next and send response with status code and body', function (done) {
    var count = createCount(2, done);
    var next = function () {
      count.next();
    };
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
    resSendAndNext(201, 'user')(req, res, next);
  });

});